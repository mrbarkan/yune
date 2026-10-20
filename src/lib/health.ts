import type { BodyComp } from "./firebase";

const ok = (n: number | null | undefined): n is number => typeof n === "number" && n > 0;

export const bmi = (weightKg: number | null, heightCm: number | null) =>
  ok(weightKg) && ok(heightCm) ? weightKg / (heightCm / 100) ** 2 : null;

export const waistHip = (waist: number | null, hip: number | null) =>
  ok(waist) && ok(hip) ? waist / hip : null;

export const waistHeight = (waist: number | null, heightCm: number | null) =>
  ok(waist) && ok(heightCm) ? waist / heightCm : null;

/** HOMA-IR = glicose (mg/dL) × insulina (µUI/mL) ÷ 405. */
export const homaIr = (glucoseMgDl: number | null, insulin: number | null) =>
  ok(glucoseMgDl) && ok(insulin) ? (glucoseMgDl * insulin) / 405 : null;

const devKey = (d: string) => d.toLowerCase().replace(/\s+/g, "");

/** Variação entre a primeira e a última leitura do mesmo aparelho; menos de duas → null. */
export function bodyCompDelta(readings: BodyComp[], device: string) {
  const rs = readings.filter((r) => devKey(r.device) === devKey(device))
    .sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  if (rs.length < 2) return null;
  const first = rs[0], last = rs[rs.length - 1];
  const diff = (k: "fat_kg" | "muscle_kg" | "lean_kg") =>
    first[k] != null && last[k] != null ? last[k]! - first[k]! : null;
  const field = (["muscle_kg", "lean_kg"] as const).find((k) => first[k] != null && last[k] != null) ?? null;
  return { since: first.measured_at, fat_kg: diff("fat_kg"), muscle_kg: field ? diff(field) : null, muscle_field: field };
}
