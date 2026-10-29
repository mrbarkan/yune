import { addDoc, arrayUnion, getDoc, setDoc } from "firebase/firestore";
import { row, table, type FoodItem, type Meal, type Place } from "./firebase";
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

/** Marca um intervalo ou refeição como respondido na revisão do dia `day` (AAAA-MM-DD). */
export async function closeInReview(day: string, key: string): Promise<void> {
  await setDoc(row("day_reviews", day), { updated_at: new Date().toISOString(), closed: arrayUnion(key) }, { merge: true });
}

export async function loadReview(day: string): Promise<string[]> {
  const snap = await getDoc(row("day_reviews", day));
  return snap.exists() ? ((snap.data().closed as string[] | undefined) ?? []) : [];
}
