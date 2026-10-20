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
