import { useCallback, useEffect, useRef, useState } from "react";
import { getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, DEFAULT_PROFILE, DEFAULT_REMINDERS, profileDoc, remindersDoc, rows, table, type Activity, type Meal, type Profile, type Sleep, type Water } from "./firebase";
import { mealDrinkMl } from "./fluids";
import { withGoalDefaults } from "./profileDefaults";
import { isDenied, retryDenied } from "./retry";
import { addDays, startOfDay } from "./time";

export type DayData = { meals: Meal[]; activities: Activity[]; water: Water[]; sleep: Sleep[] };
export const EMPTY: DayData = { meals: [], activities: [], water: [], sleep: [] };

/** Carrega registros de [from, to) — sono é atribuído ao dia em que se acorda (ou ainda dormindo). */
export async function loadRange(from: Date, to: Date): Promise<DayData> {
  const f = from.toISOString();
  const t = to.toISOString();
  const openSince = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const between = (name: "meals" | "activities" | "water", field: string) =>
    getDocs(query(table(name), where(field, ">=", f), where(field, "<", t), orderBy(field)));
  const [meals, activities, water, woke, asleep] = await Promise.all([
    between("meals", "eaten_at"),
    between("activities", "started_at"),
    between("water", "drank_at"),
    getDocs(query(table("sleep"), where("wake_at", ">=", f), where("wake_at", "<", t))),
    getDocs(query(table("sleep"), where("wake_at", "==", null), where("bed_at", ">=", openSince), where("bed_at", "<", t))),
  ]);
  return {
    meals: rows<Meal>(meals),
    activities: rows<Activity>(activities),
    water: rows<Water>(water),
    sleep: [...rows<Sleep>(woke), ...rows<Sleep>(asleep)].sort((a, b) => a.bed_at.localeCompare(b.bed_at)),
  };
}

/** Líquido do dia de `day` (ml): água registrada e bebidas das refeições. */
export async function fluidsOn(day: Date): Promise<{ water: number; drinks: number }> {
  const from = startOfDay(day).toISOString();
  const to = addDays(startOfDay(day), 1).toISOString();
  const [water, meals] = await Promise.all([
    getDocs(query(table("water"), where("drank_at", ">=", from), where("drank_at", "<", to), orderBy("drank_at"))),
    getDocs(query(table("meals"), where("eaten_at", ">=", from), where("eaten_at", "<", to), orderBy("eaten_at"))),
  ]);
  return {
    water: rows<Water>(water).reduce((s, w) => s + w.ml, 0),
    drinks: rows<Meal>(meals).reduce((s, m) => s + mealDrinkMl(m.items), 0),
  };
}

export function splitByDay(data: DayData, day: Date): DayData {
  const a = startOfDay(day).getTime();
  const b = addDays(day, 1).getTime();
  const inDay = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= a && t < b;
  };
  return {
    meals: data.meals.filter((m) => inDay(m.eaten_at)),
    activities: data.activities.filter((x) => inDay(x.started_at)),
    water: data.water.filter((w) => inDay(w.drank_at)),
    sleep: data.sleep.filter((s) => (s.wake_at ? inDay(s.wake_at) : new Date(s.bed_at).getTime() < b)),
  };
}

export function totals(d: DayData) {
  const sleepMin = d.sleep.reduce(
    (s, x) => s + (x.wake_at ? (new Date(x.wake_at).getTime() - new Date(x.bed_at).getTime()) / 60_000 : 0),
    0,
  );
  // waterMl é só a água registrada; fluidMl soma as bebidas das refeições.
  const waterMl = d.water.reduce((s, w) => s + w.ml, 0);
  const drinksMl = d.meals.reduce((s, m) => s + mealDrinkMl(m.items), 0);
  return {
    kcalIn: d.meals.reduce((s, m) => s + m.kcal, 0),
    kcalOut: d.activities.reduce((s, a) => s + a.kcal, 0),
    waterMl,
    drinksMl,
    fluidMl: waterMl + drinksMl,
    activeMin: d.activities.reduce((s, a) => s + a.duration_min, 0),
    sleepMin,
    protein: d.meals.reduce((s, m) => s + (m.protein_g ?? 0), 0),
    carbs: d.meals.reduce((s, m) => s + (m.carbs_g ?? 0), 0),
    fat: d.meals.reduce((s, m) => s + (m.fat_g ?? 0), 0),
  };
}

export function useRange(from: Date, days: number, version: number) {
  const [data, setData] = useState<DayData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const key = startOfDay(from).getTime();
  const loaded = useRef("");
  useEffect(() => {
    let alive = true;
    const id = `${key}:${days}`;
    // Só mostra "carregando" ao trocar de período; ao atualizar, os dados continuam na tela.
    if (loaded.current !== id) setLoading(true);
    loadRange(new Date(key), addDays(new Date(key), days)).then((d) => {
      if (alive) {
        loaded.current = id;
        setData(d);
        setLoading(false);
      }
    }, () => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [key, days, version]);
  return { data, loading };
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!userId) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Sao_Paulo";
    const ref = profileDoc(userId);
    const snap = await getDoc(ref);
    let p: Profile;
    if (!snap.exists()) {
      // Primeiro acesso: cria perfil e lembretes com os valores padrão. Antes, renova o token: se a conta foi apagada
      // (em outro aparelho), a renovação falha e o SDK sai da sessão, em vez de recriar dados de uma conta que não existe.
      await auth.currentUser?.getIdToken(true);
      p = { id: userId, ...DEFAULT_PROFILE, name: auth.currentUser?.displayName || null, timezone: tz };
      const { id: _, ...data } = p;
      await setDoc(ref, data);
      await setDoc(remindersDoc(userId), DEFAULT_REMINDERS);
    } else {
      p = withGoalDefaults({ ...(snap.data() as Omit<Profile, "id">), id: userId });
      if (p.timezone !== tz) {
        await updateDoc(ref, { timezone: tz });
        p.timezone = tz;
      }
    }
    setProfile(p);
    setError(null);
  }, [userId]);
  // Logo após "Já confirmei" o Firestore pode ainda estar com o token sem email_verified: renova e tenta de novo.
  const reload = useCallback(async () => {
    try {
      await retryDenied(load, () => auth.currentUser?.getIdToken(true) ?? Promise.resolve());
    } catch (err) {
      // Depois da primeira carga o perfil já está na tela: uma falha de reload fica só no console e em `error`, que a tela não mostra enquanto há perfil.
      console.error(err);
      setError(isDenied(err)
        ? "Não conseguimos confirmar seu acesso. Saia e entre de novo."
        : "Não foi possível carregar seu perfil. Verifique a conexão e tente de novo.");
    }
  }, [load]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { profile, reload, error };
}
