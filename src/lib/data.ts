import { useCallback, useEffect, useState } from "react";
import { supabase, type Activity, type Meal, type Profile, type Sleep, type Water } from "./supabase";
import { addDays, startOfDay } from "./time";

export type DayData = { meals: Meal[]; activities: Activity[]; water: Water[]; sleep: Sleep[] };
export const EMPTY: DayData = { meals: [], activities: [], water: [], sleep: [] };

/** Carrega registros de [from, to) — sono é atribuído ao dia em que se acorda (ou ainda dormindo). */
export async function loadRange(from: Date, to: Date): Promise<DayData> {
  const f = from.toISOString();
  const t = to.toISOString();
  const openSince = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const [meals, activities, water, sleep] = await Promise.all([
    supabase.from("meals").select("*").gte("eaten_at", f).lt("eaten_at", t).order("eaten_at"),
    supabase.from("activities").select("*").gte("started_at", f).lt("started_at", t).order("started_at"),
    supabase.from("water").select("*").gte("drank_at", f).lt("drank_at", t).order("drank_at"),
    supabase.from("sleep").select("*").or(`and(wake_at.gte.${f},wake_at.lt.${t}),and(wake_at.is.null,bed_at.gte.${openSince},bed_at.lt.${t})`).order("bed_at"),
  ]);
  return {
    meals: (meals.data ?? []) as Meal[],
    activities: (activities.data ?? []) as Activity[],
    water: (water.data ?? []) as Water[],
    sleep: (sleep.data ?? []) as Sleep[],
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
  return {
    kcalIn: d.meals.reduce((s, m) => s + m.kcal, 0),
    kcalOut: d.activities.reduce((s, a) => s + a.kcal, 0),
    waterMl: d.water.reduce((s, w) => s + w.ml, 0),
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
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRange(new Date(key), addDays(new Date(key), days)).then((d) => {
      if (alive) {
        setData(d);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [key, days, version]);
  return { data, loading };
}

export function useProfile(userId: string | undefined) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const reload = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
    const p = data as Profile | null;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (p && tz && p.timezone !== tz) {
      await supabase.from("profiles").update({ timezone: tz }).eq("id", userId);
      p.timezone = tz;
    }
    setProfile(p);
  }, [userId]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { profile, reload };
}
