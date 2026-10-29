// Valores iniciais sem dependência do app Firebase (importável em testes de regras).
import type { Profile, Reminders } from "./firebase";

export const DEFAULT_PROFILE: Omit<Profile, "id" | "name" | "timezone"> = {
  sex: null, birth_year: null, height_cm: null, weight_kg: null,
  kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480,
};

export const DEFAULT_REMINDERS: Omit<Reminders, "user_id"> = {
  water_enabled: true, water_every_min: 120, water_start: "09:00", water_end: "21:00",
  summary_enabled: true, summary_time: "21:30", bedtime_enabled: false, bedtime_time: "23:00",
  push_details: false, gap_enabled: true,
};

export const DEFAULT_WATER_SIZES = [150, 250, 350, 500];
