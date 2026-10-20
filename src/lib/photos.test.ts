import { describe, expect, it } from "vitest";
import { compareChange, nearestMeasurement, sessions } from "./photos";
import type { BodyPhoto, Measurement, Pose } from "./firebase";

const p = (id: string, pose: Pose, taken_at: string): BodyPhoto => ({ id, pose, taken_at, path: `body-photos/u/${id}.jpg` });

describe("sessions", () => {
  it("mantém a foto mais recente de cada pose no mesmo dia", () => {
    const out = sessions([p("a", "frente", "2026-10-18T10:00:00.000Z"), p("b", "frente", "2026-10-18T15:00:00.000Z")], "America/Sao_Paulo");
    expect(out).toHaveLength(1);
    expect(out[0].photos.frente?.id).toBe("b");
  });
  it("agrupa pelo dia local do fuso", () => {
    const out = sessions([p("a", "frente", "2026-10-19T02:00:00.000Z"), p("b", "lado", "2026-10-18T23:00:00.000Z")], "America/Sao_Paulo");
    expect(out).toHaveLength(1);
    expect(out[0].day).toBe("2026-10-18");
    expect(out[0].photos.frente?.id).toBe("a");
    expect(out[0].photos.lado?.id).toBe("b");
  });
  it("ordena do dia mais novo para o mais antigo", () => {
    const out = sessions([p("a", "frente", "2026-10-01T12:00:00.000Z"), p("b", "frente", "2026-10-10T12:00:00.000Z")], "UTC");
    expect(out.map((s) => s.day)).toEqual(["2026-10-10", "2026-10-01"]);
  });
});

describe("nearestMeasurement", () => {
  const m = (id: string, at: string): Measurement => ({ id, measured_at: at, weight_kg: 70, waist_cm: null, hip_cm: null, neck_cm: null, source: "manual" });
  it("pega a mais perto dentro de 3 dias", () => {
    const list = [m("a", "2026-10-10T12:00:00.000Z"), m("b", "2026-10-17T12:00:00.000Z")];
    expect(nearestMeasurement(list, "2026-10-18")?.id).toBe("b");
  });
  it("devolve nulo quando passa de 3 dias", () => {
    expect(nearestMeasurement([m("a", "2026-10-10T12:00:00.000Z")], "2026-10-18")).toBeNull();
  });
});

describe("compareChange", () => {
  const m = (id: string, weight_kg: number, waist_cm: number | null): Measurement => ({ id, measured_at: "2026-10-01T12:00:00.000Z", weight_kg, waist_cm, hip_cm: null, neck_cm: null, source: "manual" });
  it("é nulo quando as duas são a mesma medida", () => {
    const a = m("a", 70, 80);
    expect(compareChange(a, a)).toBeNull();
  });
  it("devolve as variações entre medidas diferentes", () => {
    expect(compareChange(m("a", 75, 90), m("b", 72, 85))).toEqual({ weight: -3, waist: -5 });
  });
  it("cintura nula quando falta em uma", () => {
    expect(compareChange(m("a", 75, null), m("b", 72, 85))).toEqual({ weight: -3, waist: null });
  });
  it("é nulo quando falta uma medida", () => {
    expect(compareChange(null, m("b", 72, 85))).toBeNull();
  });
});
