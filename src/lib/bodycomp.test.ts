import { describe, expect, it } from "vitest";
import { deltaText, parseValues } from "./bodycomp";

describe("parseValues", () => {
  it("vazio vira null e vírgula é lida", () => {
    const r = parseValues({ weight_kg: "71,8", bmr_kcal: "1.412", fat_pct: " " });
    expect(r).toEqual({ values: expect.objectContaining({ weight_kg: 71.8, bmr_kcal: 1412, fat_pct: null, phase_angle: null }) });
  });
  it("zero e fora da faixa são recusados", () => {
    expect(parseValues({ visceral: "0" })).toHaveProperty("error");
    expect(parseValues({ ecw_tbw: "0,7" })).toHaveProperty("error");
  });
  it("texto não numérico é recusado", () => {
    expect(parseValues({ weight_kg: "abc" })).toHaveProperty("error");
  });
});

describe("deltaText", () => {
  it("mostra sinais e o campo de músculo", () => {
    expect(deltaText({ fat_kg: -3.1, muscle_kg: -0.3, muscle_field: "muscle_kg" })).toBe("−3,1 kg gordura · −0,3 kg músculo");
    expect(deltaText({ fat_kg: null, muscle_kg: 0.4, muscle_field: "lean_kg" })).toBe("+0,4 kg massa magra");
  });
});
