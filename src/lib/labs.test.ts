import { describe, expect, it } from "vitest";
import { normalizeResult, outOfRange, unitKey, LAB_CATALOG } from "./labs";
import type { LabResult } from "./firebase";

const r = (o: Partial<LabResult>): LabResult => ({
  code: "glicemia", name: "", value: 90, value_text: "", unit: "mg/dL", ref_low: null, ref_high: null, ref_text: "", ...o,
});

describe("labs", () => {
  it("converte para a unidade canônica", () => {
    const g = normalizeResult(r({ value: 5.0, unit: "mmol/L" }))!;
    expect(g.unit).toBe("mg/dL");
    expect(g.value).toBeCloseTo(90.1, 1);
    const d = normalizeResult(r({ code: "vitamina_d", value: 55, unit: "nmol/L" }))!;
    expect(d.unit).toBe("ng/mL");
    expect(d.value).toBeCloseTo(22, 0);
  });
  it("grafias da unidade", () => {
    for (const u of ["MG/DL", "mg/dl", "mg / dL"]) expect(normalizeResult(r({ unit: u }))).toEqual({ value: 90, unit: "mg/dL" });
    expect(unitKey("MMOL / L")).toBe(unitKey("mmol/L"));
    for (const u of ["µUI/mL", "uUI/mL", "μUI/mL", "mcUI/mL"])
      expect(normalizeResult(r({ code: "insulina", value: 10, unit: u }))).toEqual({ value: 10, unit: "µUI/mL" });
  });
  it("sem valor, unidade ou código desconhecidos -> null", () => {
    const t = r({ value: null, value_text: "<5" });
    expect(normalizeResult(t)).toBeNull();
    expect(outOfRange(t)).toBeNull();
    expect(normalizeResult(r({ unit: "xyz" }))).toBeNull();
    expect(normalizeResult(r({ code: "outro" }))).toBeNull();
  });
  it("outOfRange compara valor bruto com a faixa bruta", () => {
    expect(outOfRange(r({ code: "ldl", value: 142, ref_high: 130 }))).toBe(true);
    expect(outOfRange(r({ code: "ldl", value: 142 }))).toBeNull();
    expect(outOfRange(r({ value: 100, ref_low: 70, ref_high: 99 }))).toBe(true);
    expect(outOfRange(r({ value: 85, ref_low: 70, ref_high: 99 }))).toBe(false);
  });
  it("catálogo tem 21 exames em gráfico", () => {
    expect(LAB_CATALOG).toHaveLength(21);
    expect(LAB_CATALOG.every((l) => l.chart)).toBe(true);
  });
});
