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
export type Table = "meals" | "activities" | "water" | "sleep" | "custom_foods" | "push_subscriptions" | "diet_plans"
  | "measurements" | "body_comp" | "lab_reports" | "body_photos" | "anamnesis" | "recipes";

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
export async function estimateFood<T>(body: unknown): Promise<T & { error?: string; consent?: "required" }> {
  try {
    const res = await httpsCallable(functions, "estimateFood")(body);
    return res.data as T & { error?: string; consent?: "required" };
  } catch {
    return { error: "Não foi possível calcular agora." } as T & { error?: string; consent?: "required" };
  }
}

/** Lê a dieta enviada (arquivo no Storage ou texto colado). Pode levar até um minuto. */
export async function importDietPlan(body: { path: string; name: string } | { text: string }): Promise<{ id?: string; error?: string; consent?: "required" }> {
  try {
    const res = await httpsCallable(functions, "importDietPlan", { timeout: 300_000 })(body);
    return res.data as { id?: string; error?: string; consent?: "required" };
  } catch {
    return { error: "Não foi possível ler a dieta agora." };
  }
}

export const DEFAULT_WATER_SIZES = [150, 250, 350, 500];

export { DEFAULT_PROFILE, DEFAULT_REMINDERS } from "./defaults";

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
  /** Caminho da foto de perfil no Storage. */
  photo_path?: string | null;
  /** Autorização para enviar dados à IA (Anthropic); ausente/null = não autorizou. */
  ai_consent?: { at: string; version: number } | null;
};

export type Measurement = {
  id: string; measured_at: string; weight_kg: number;
  waist_cm: number | null; hip_cm: number | null; neck_cm: number | null;
  source: "manual" | "body_comp"; created_at?: string;
};

export type BodyCompValues = {
  weight_kg: number | null; fat_pct: number | null; fat_kg: number | null; muscle_kg: number | null;
  lean_kg: number | null; visceral: number | null; bmr_kcal: number | null; water_l: number | null;
  ecw_tbw: number | null; phase_angle: number | null;
};

export type BodyComp = BodyCompValues & {
  id: string; measured_at: string; device: string; file_path: string | null; ai: boolean; created_at: string;
};

export type LabResult = {
  code: string; name: string; value: number | null; value_text: string; unit: string;
  ref_low: number | null; ref_high: number | null; ref_text: string;
};

export type LabReport = {
  id: string; collected_at: string; lab: string | null; results: LabResult[];
  file_paths: string[]; ai: boolean; created_at: string;
};

type HealthMode = "body_comp" | "labs";
export type BodyCompDraft = Omit<BodyComp, "id" | "file_path" | "ai" | "created_at">;
export type LabsDraft = Omit<LabReport, "id" | "file_paths" | "ai" | "created_at">;

/** Lê o laudo enviado (foto ou PDF) e devolve um rascunho para a pessoa conferir. */
export async function readHealthDoc<T extends BodyCompDraft | LabsDraft>(
  body: { mode: HealthMode; paths: string[] },
): Promise<{ draft?: T; error?: string; consent?: "required" }> {
  try {
    const res = await httpsCallable(functions, "readHealthDoc", { timeout: 120_000 })(body);
    return res.data as { draft?: T; error?: string; consent?: "required" };
  } catch {
    return { error: "Não foi possível ler o documento agora." };
  }
}

/** Grava os valores confirmados (cria, ou atualiza se vier `id`). Só o servidor escreve nessas coleções. */
export async function saveHealthDoc(
  body: { mode: HealthMode; id?: string; data: BodyCompDraft | LabsDraft; paths: string[]; ai: boolean },
): Promise<{ id?: string; error?: string }> {
  try {
    const res = await httpsCallable(functions, "saveHealthDoc")(body);
    return res.data as { id?: string; error?: string };
  } catch {
    return { error: "Não foi possível salvar agora." };
  }
}

export type Pose = "frente" | "lado" | "costas";

export type BodyPhoto = { id: string; taken_at: string; pose: Pose; path: string; created_at?: string };

export type FoodItem = {
  name: string; quantity: string; grams: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number;
  recipe_id?: string;
};

export type RecipeUnit = "ml" | "g" | "porcoes";

/** Receita: itens somados + quanto rendeu (ml, g ou porções). */
export type Recipe = {
  id: string;
  name: string;
  items: FoodItem[];
  yield_amount: number;
  yield_unit: RecipeUnit;
  created_at: string;
  updated_at: string;
};

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
  push_details: boolean;
};

export type StripeState = { status: string; until: string; cancel_at_period_end: boolean; trial_end: string | null };
export type Entitlements = {
  pro: boolean;
  until: string | null;
  source?: "stripe" | "beta" | null;
  beta_until?: string | null;
  stripe?: StripeState | null;
};

/** Valor em centavos, como vem da Stripe; o app formata. */
export type ProPrice = { amount: number; currency: string };
/** `trial`: "7d" = 7 dias grátis; "beta" = o teste vai até o fim do beta; "none" = cobra já. */
export type ProPrices = { monthly: ProPrice; annual: ProPrice; trial: "7d" | "beta" | "none" };

/** Abre o Checkout da Stripe para assinar o Pro. */
export async function createCheckout(plan: "monthly" | "annual"): Promise<{ url?: string; error?: string }> {
  try {
    const res = await httpsCallable(functions, "createCheckout")({ plan });
    return res.data as { url?: string; error?: string };
  } catch {
    return { error: "Não foi possível abrir o pagamento agora." };
  }
}

/** Portal do cliente da Stripe (trocar cartão, cancelar). */
export async function createPortal(): Promise<{ url?: string; error?: string }> {
  try {
    const res = await httpsCallable(functions, "createPortal")();
    return res.data as { url?: string; error?: string };
  } catch {
    return { error: "Não foi possível abrir a assinatura agora." };
  }
}

/** Apaga a conta e todos os dados (exige login recente e a palavra APAGAR). */
export async function deleteAccount(): Promise<{ ok?: true; error?: string; reauth?: true }> {
  try {
    const res = await httpsCallable(functions, "deleteAccount", { timeout: 300_000 })({ confirm: "APAGAR" });
    return res.data as { ok?: true; error?: string; reauth?: true };
  } catch {
    return { error: "Não foi possível apagar agora. Parte dos dados pode já ter sido apagada; tente de novo para concluir." };
  }
}

export async function getProPrices(): Promise<ProPrices | { error: string }> {
  try {
    const res = await httpsCallable(functions, "getProPrices")();
    return res.data as ProPrices | { error: string };
  } catch {
    return { error: "Não foi possível carregar os preços agora." };
  }
}

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
