import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { collection, connectFirestoreEmulator, doc, getFirestore, type QuerySnapshot } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { connectStorageEmulator, getStorage } from "firebase/storage";

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
const functions = getFunctions(app, import.meta.env.VITE_FIREBASE_REGION || "southamerica-east1");

// Com VITE_USE_EMULATORS=1 (.env.emulator) tudo aponta para os emuladores locais.
if (import.meta.env.VITE_USE_EMULATORS === "1") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8085);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

/** Registros de cada pessoa ficam em users/{uid}/{coleção}. */
export type Table = "meals" | "activities" | "water" | "sleep" | "custom_foods" | "push_subscriptions" | "diet_plans";

const uid = () => {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login para continuar.");
  return u.uid;
};

export const table = (name: Table) => collection(db, "users", uid(), name);
export const row = (name: Table, id: string) => doc(db, "users", uid(), name, id);
export const profileDoc = (id: string) => doc(db, "users", id);
export const remindersDoc = (id: string) => doc(db, "reminders", id);
export const entitlementsDoc = (id: string) => doc(db, "entitlements", id);

export const rows = <T,>(snap: QuerySnapshot) => snap.docs.map((d) => ({ ...d.data(), id: d.id }) as T);

/** Chama a função estimate-food. Como nas outras funções, erros voltam como `{ error }`. */
export async function estimateFood<T>(body: unknown): Promise<T & { error?: string }> {
  try {
    const res = await httpsCallable(functions, "estimateFood")(body);
    return res.data as T & { error?: string };
  } catch {
    return { error: "Não foi possível calcular agora." } as T & { error?: string };
  }
}

/** Lê a dieta enviada (arquivo no Storage ou texto colado). Pode levar até um minuto. */
export async function importDietPlan(body: { path: string; name: string } | { text: string }): Promise<{ id?: string; error?: string }> {
  try {
    const res = await httpsCallable(functions, "importDietPlan", { timeout: 300_000 })(body);
    return res.data as { id?: string; error?: string };
  } catch {
    return { error: "Não foi possível ler a dieta agora." };
  }
}

export const DEFAULT_PROFILE: Omit<Profile, "id" | "name" | "timezone"> = {
  sex: null, birth_year: null, height_cm: null, weight_kg: null,
  kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480,
};

export const DEFAULT_WATER_SIZES = [150, 250, 350, 500];

export const DEFAULT_REMINDERS: Omit<Reminders, "user_id"> = {
  water_enabled: true, water_every_min: 120, water_start: "09:00", water_end: "21:00",
  summary_enabled: true, summary_time: "21:30", bedtime_enabled: false, bedtime_time: "23:00",
};

export type Profile = {
  id: string;
  name: string | null;
  sex: "f" | "m" | null;
  birth_year: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  kcal_goal: number;
  water_goal_ml: number;
  sleep_goal_min: number;
  timezone: string;
  /** Tamanhos dos botões de água (ml); ausente = DEFAULT_WATER_SIZES. */
  water_sizes?: number[];
};

export type FoodItem = { name: string; quantity: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type Place = "casa" | "restaurante" | "delivery";

export type CustomFood = {
  id: string;
  name: string;
  brand: string | null;
  serving_label: string;
  serving_g: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type Meal = {
  id: string;
  eaten_at: string;
  description: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  items: FoodItem[] | null;
  source: "ai" | "manual";
  place: Place;
  photo_path: string | null;
};

export type Activity = {
  id: string;
  started_at: string;
  kind: string;
  duration_min: number;
  intensity: "leve" | "moderada" | "intensa";
  kcal: number;
  note: string | null;
};

export type Water = { id: string; drank_at: string; ml: number };
export type Sleep = { id: string; bed_at: string; wake_at: string | null };

export type Reminders = {
  user_id: string;
  water_enabled: boolean;
  water_every_min: number;
  water_start: string;
  water_end: string;
  summary_enabled: boolean;
  summary_time: string;
  bedtime_enabled: boolean;
  bedtime_time: string;
};

export type Entitlements = { pro: boolean; until: string | null; source?: string };

export type DietRule = {
  kind: "avoid" | "limit" | "prefer";
  name: string;
  detail: string;
  max_per_day: number | null;
  unit: "g" | "ml" | "vezes" | null;
  keywords: string[];
};

export type DietMeal = { name: string; time: string | null; notes: string; options: { label: string; items: FoodItem[] }[] };

/** Dieta prescrita, organizada pela função importDietPlan. Só uma fica ativa. */
export type DietPlan = {
  id: string;
  title: string;
  prescriber: string | null;
  issued_on: string | null;
  summary: string;
  targets: { kcal: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; fiber_g: number | null; water_ml: number | null };
  meals: DietMeal[];
  rules: DietRule[];
  guidelines: string[];
  notes: string;
  active: boolean;
  file_path: string | null;
  file_name: string | null;
  created_at: string;
};
