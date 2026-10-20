import { describe, expect, it } from "vitest";
import { analyteSeries, collectedAtFor, outOfRangeCount, reportHoma } from "./labreports";
import type { LabReport, LabResult } from "./firebase";

const res = (o: Partial<LabResult>): LabResult => ({
  code: "glicemia", name: "", value: 90, value_text: "", unit: "mg/dL", ref_low: null, ref_high: null, ref_text: "", ...o,
});
const rep = (id: string, at: string, results: LabResult[]): LabReport => ({
  id, collected_at: at, lab: null, results, file_paths: [], ai: false, created_at: at,
});

describe("labreports", () => {
  const a = rep("a", "2026-01-10T12:00:00.000Z", [
    res({ value: 5.0, unit: "mmol/L", ref_low: 3.9, ref_high: 5.5 }),
    res({ code: "pcr_us", value: null, value_text: "<5", unit: "mg/L" }),
  ]);
  const b = rep("b", "2026-03-10T12:00:00.000Z", [
    res({ value: 95, ref_low: 70, ref_high: 99 }),
    res({ code: "pcr_us", value: null, value_text: "<5", unit: "mg/L" }),
  ]);
  it("série converte valor e faixa com o mesmo fator", () => {
    const s = analyteSeries([b, a], "glicemia");
    expect(s).toHaveLength(2);
    expect(s[0].v).toBeCloseTo(90.1, 1);
    expect(s[0].band.low).toBeCloseTo(70.3, 1);
    expect(s[0].band.high).toBeCloseTo(99.1, 1);
    expect(s[1]).toEqual({ t: b.collected_at, v: 95, band: { low: 70, high: 99 } });
  });
  it("valor não numérico é ignorado", () => {
    expect(analyteSeries([a, b], "pcr_us")).toEqual([]);
  });
  it("conta só os fora da referência", () => {
    const r = rep("c", "2026-01-01T00:00:00.000Z", [
      res({ value: 120, ref_high: 99 }), res({ value: 80, ref_low: 70, ref_high: 99 }), res({ value: 5 }),
      res({ value: null, value_text: ">10", ref_high: 5 }),
    ]);
    expect(outOfRangeCount(r)).toBe(1);
  });
  it("HOMA-IR a partir de glicemia e insulina normalizadas", () => {
    const r = rep("d", "2026-01-01T00:00:00.000Z", [res({ value: 5, unit: "mmol/L" }), res({ code: "insulina", value: 10, unit: "µUI/mL" })]);
    expect(reportHoma(r)).toBeCloseTo((5 * 18.016 * 10) / 405, 3);
    expect(reportHoma(a)).toBeNull();
  });
  it("coleta hoje de manhã é aceita, amanhã é recusada", () => {
    const now = new Date("2026-10-19T12:00:00.000Z"); // 09:00 em São Paulo
    const today = collectedAtFor("2026-10-19", "America/Sao_Paulo", now);
    expect("iso" in today && Date.parse(today.iso) <= now.getTime()).toBe(true);
    expect(collectedAtFor("2026-10-20", "America/Sao_Paulo", now)).toHaveProperty("error");
    expect(collectedAtFor("2026-10-18", "America/Sao_Paulo", now)).toHaveProperty("iso");
  });
});
