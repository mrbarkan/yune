import { describe, expect, it } from "vitest";
import { changeSince, shouldUpdateWeight } from "./measurements";
import type { Measurement } from "./firebase";

const m = (id: string, measured_at: string, weight_kg: number): Measurement => ({
  id, measured_at, weight_kg, waist_cm: null, hip_cm: null, neck_cm: null, source: "manual",
});
const a = m("a", "2026-09-01T10:00:00.000Z", 75);
const b = m("b", "2026-10-01T10:00:00.000Z", 72);

describe("shouldUpdateWeight", () => {
  it("é verdadeiro para a medida mais recente", () => {
    expect(shouldUpdateWeight([a, b], b)).toBe(true);
  });
  it("é falso para uma medida com data anterior", () => {
    expect(shouldUpdateWeight([a, b], a)).toBe(false);
  });
  it("é verdadeiro quando é a única", () => {
    expect(shouldUpdateWeight([a], a)).toBe(true);
  });
});

describe("changeSince", () => {
  const day = 86_400_000;
  const at = (n: number) => new Date(Date.parse("2026-10-19T10:00:00.000Z") - n * day).toISOString();
  it("compara com a medida mais perto de 56 dias antes", () => {
    const list = [m("1", at(60), 78), m("2", at(50), 77), m("3", at(0), 72)];
    expect(changeSince(list)).toEqual({ delta: -6, days: 60 });
  });
  it("some quando nada cai na janela de 42 a 70 dias", () => {
    expect(changeSince([m("1", at(20), 75), m("2", at(0), 72)])).toBeNull();
  });
  it("some com uma só medida", () => {
    expect(changeSince([m("1", at(0), 72)])).toBeNull();
  });
});
