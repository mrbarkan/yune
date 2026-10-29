import { addDoc, arrayUnion, getDoc, getDocs, limit, orderBy, query, setDoc, where } from "firebase/firestore";
import { row, rows, table, type FoodItem, type Meal, type Place, type Recipe } from "./firebase";
import type { QuickChip } from "./review";
import { mealName } from "./slots";

/** Campos de uma refeição gravada (FoodSheet e registro rápido). */
export function mealFields(items: FoodItem[], at: string, place: Place, source: "ai" | "manual", photo_path: string | null) {
  const sum = (k: "protein_g" | "carbs_g" | "fat_g") => Math.round(items.reduce((s, i) => s + i[k], 0) * 10) / 10;
  return {
    eaten_at: at,
    description: items.map((i) => i.name).join(", ").slice(0, 600) || mealName(new Date(at)),
    kcal: items.reduce((s, i) => s + i.kcal, 0),
    protein_g: sum("protein_g"),
    carbs_g: sum("carbs_g"),
    fat_g: sum("fat_g"),
    items,
    source,
    place,
    photo_path,
  };
}

/** Repete os itens de `m` no horário `at` (sem a foto). Devolve o id novo. */
export async function copyMeal(m: Meal, at: string): Promise<string> {
  const doc = await addDoc(table("meals"), { ...mealFields(m.items!, at, m.place ?? "casa", m.source, null), created_at: new Date().toISOString() });
  return doc.id;
}

/** Registra o atalho no horário `at`: a refeição inteira ou um item só (em casa). Devolve o id novo. */
export async function logChip(c: QuickChip, at: string): Promise<string> {
  if ("meal" in c) return copyMeal(c.meal, at);
  const doc = await addDoc(table("meals"), { ...mealFields([c.item], at, "casa", "manual", null), created_at: new Date().toISOString() });
  return doc.id;
}

/** Refeições das últimas 8 semanas, mais recentes primeiro (base dos atalhos). */
export async function loadHistory(now = new Date()): Promise<Meal[]> {
  const since = new Date(now.getTime() - 56 * 86_400_000).toISOString();
  return rows<Meal>(await getDocs(query(table("meals"), where("eaten_at", ">=", since), orderBy("eaten_at", "desc"), limit(400))));
}

export async function loadRecipes(): Promise<Recipe[]> {
  return rows<Recipe>(await getDocs(query(table("recipes"), orderBy("updated_at", "desc"))));
}

/** Marca um intervalo ou refeição como respondido na revisão do dia `day` (AAAA-MM-DD). */
export async function closeInReview(day: string, key: string): Promise<void> {
  await setDoc(row("day_reviews", day), { updated_at: new Date().toISOString(), closed: arrayUnion(key) }, { merge: true });
}

export async function loadReview(day: string): Promise<string[]> {
  const snap = await getDoc(row("day_reviews", day));
  return snap.exists() ? ((snap.data().closed as string[] | undefined) ?? []) : [];
}

