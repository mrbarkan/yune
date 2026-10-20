import { describe, expect, it, vi } from "vitest";
import { clipPlan } from "./dietClip.js";

const sample = () => ({
  title: "Plano", prescriber: "Ana, CRN 1234", issued_on: "2026-10-01", summary: "Emagrecer.", notes: "ok",
  targets: { kcal: 1800, protein_g: 120, carbs_g: 200, fat_g: 60, fiber_g: 25, water_ml: 2500 } as Record<string, number | null>,
  meals: [{ name: "Almoço", time: "12:30", notes: "", options: [{ label: "Opção 1", items: [
    { name: "Arroz", quantity: "4 colheres", grams: 100, kcal: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.2 },
  ] }] }],
  rules: [{ kind: "limit", name: "Doce", detail: "pouco", max_per_day: 30, unit: "g", keywords: ["doce"] }],
  guidelines: ["Beba água"],
});

describe("clipPlan", () => {
  it("não altera um plano bem formado", () => {
    expect(clipPlan(sample())).toEqual(sample());
  });
  it("corta título em 120", () => {
    expect(clipPlan({ ...sample(), title: "a".repeat(500) }).title).toHaveLength(120);
  });
  it("limita regras a 60", () => {
    const rule = sample().rules[0]!;
    expect(clipPlan({ ...sample(), rules: Array.from({ length: 100 }, () => rule) }).rules).toHaveLength(60);
  });
  it("meta fora da faixa vira null", () => {
    expect(clipPlan({ ...sample(), targets: { ...sample().targets, kcal: 50000 } }).targets.kcal).toBeNull();
  });
  it("grams negativo vira 0", () => {
    const p = sample();
    p.meals[0]!.options[0]!.items[0]!.grams = -3;
    expect(clipPlan(p).meals[0]!.options[0]!.items[0]!.grams).toBe(0);
  });
});

describe("clipPlan (extras)", () => {
  it("força strings e corta orientações em 300", () => {
    const out = clipPlan({ ...sample(), guidelines: ["x".repeat(900), 42 as unknown as string] });
    expect(out.guidelines[0]).toHaveLength(300);
    expect(out.guidelines[1]).toBe("42");
  });
  it("avisa quando trunca regras", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rule = sample().rules[0]!;
    clipPlan({ ...sample(), rules: Array.from({ length: 61 }, () => rule) });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
