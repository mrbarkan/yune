import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: true, autoRefreshToken: true } },
);

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
};

export type FoodItem = { name: string; quantity: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number };

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
