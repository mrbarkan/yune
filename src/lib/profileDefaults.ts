import { DEFAULT_PROFILE } from "./defaults";

const GOALS = ["kcal_goal", "water_goal_ml", "sleep_goal_min"] as const;

/** Metas ausentes ou inválidas (doc parcial, valor nulo) voltam ao padrão: delas saem divisões e atributos do mostrador. */
export function withGoalDefaults<T extends Record<string, unknown>>(p: T): T {
  const out: Record<string, unknown> = { ...p };
  for (const k of GOALS) {
    const v = out[k];
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) out[k] = DEFAULT_PROFILE[k];
  }
  return out as T;
}

/** Metas só valem se forem números positivos. */
export const goalsValid = (p: Record<string, unknown>) =>
  GOALS.every((k) => typeof p[k] === "number" && Number.isFinite(p[k]) && (p[k] as number) > 0);

/** Fração da meta calórica já consumida (0–1); meta ausente, zero ou NaN dá 0. */
export function goalFraction(kcalIn: number, goal: number | null | undefined) {
  const f = kcalIn / Math.max(goal || 0, 1);
  return Number.isFinite(f) ? Math.min(Math.max(f, 0), 1) : 0;
}
