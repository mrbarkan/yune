import { describe, expect, it } from "vitest";
import { bmi, bodyCompDelta, homaIr, waistHeight, waistHip } from "./health";
import type { BodyComp } from "./firebase";

const base: BodyComp = {
  id: "", measured_at: "", device: "", file_path: null, ai: false, created_at: "",
  weight_kg: null, fat_pct: null, fat_kg: null, muscle_kg: null, lean_kg: null, visceral: null,
  bmr_kcal: null, water_l: null, ecw_tbw: null, phase_angle: null,
};
const A = { ...base, id: "a", device: "InBody", measured_at: "2026-08-12T10:00:00.000Z", fat_kg: 24.0, muscle_kg: 26.3 };
const B = { ...base, id: "b", device: "Tanita", measured_at: "2026-09-01T10:00:00.000Z", fat_kg: 30, muscle_kg: 20 };
const C = { ...base, id: "c", device: "InBody", measured_at: "2026-10-02T10:00:00.000Z", fat_kg: 20.9, muscle_kg: 26.0 };

describe("health", () => {
  it("imc, cintura/quadril, cintura/altura, HOMA-IR", () => {
    expect(bmi(71.8, 165)).toBeCloseTo(26.37, 2);
    expect(waistHip(82, 100)).toBeCloseTo(0.82);
    expect(waistHeight(82, 165)).toBeCloseTo(0.497, 3);
    expect(homaIr(90, 10)).toBeCloseTo(2.22, 2);
    expect(bmi(71.8, null)).toBeNull();
    expect(waistHip(0, 100)).toBeNull();
    expect(homaIr(90, null)).toBeNull();
  });
  it("bodyCompDelta compara primeira e última do mesmo aparelho", () => {
    const d = bodyCompDelta([C, B, A], "InBody")!;
    expect(d.since).toBe(A.measured_at);
    expect(d.fat_kg).toBeCloseTo(-3.1);
    expect(d.muscle_kg).toBeCloseTo(-0.3);
    expect(d.muscle_field).toBe("muscle_kg");
  });
  it("uma leitura só -> null", () => {
    expect(bodyCompDelta([A, B, C], "Tanita")).toBeNull();
  });
  it("usa lean_kg quando muscle_kg falta", () => {
    const a = { ...A, muscle_kg: null, lean_kg: 50 };
    const c = { ...C, muscle_kg: null, lean_kg: 49 };
    const d = bodyCompDelta([a, c], "InBody")!;
    expect(d.muscle_field).toBe("lean_kg");
    expect(d.muscle_kg).toBeCloseTo(-1);
  });
  it("aparelho ignora caixa e espaços", () => {
    const a = { ...A, device: "inbody 570" };
    const c = { ...C, device: "InBody 570" };
    expect(bodyCompDelta([a, c], "InBody570")).not.toBeNull();
  });
});
