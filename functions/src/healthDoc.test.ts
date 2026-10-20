import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { canSave, parseDecimal, toBodyCompDraft, toLabsDraft, validateBodyComp, validateLabReport } from "./healthDoc.js";
import { LAB_CODES } from "./labCodes.js";

const result = (o: Record<string, string>) => ({ code: "glicemia", name: "Glicemia", value: "", unit: "", ref_low: "", ref_high: "", ref_text: "", ...o });
const labs = (results: Record<string, string>[], collected_on = "2026-03-10") => toLabsDraft({ collected_on, lab: "", results });

// Mesmos casos de src/lib/num.test.ts: as duas cópias precisam ler igual.
describe("parseDecimal", () => {
  it.each([
    ["71,8", 71.8], ["1.412", 1412], ["1.412,5", 1412.5], ["0,36", 0.36], ["0.36", 0.36], ["2", 2], [" 82 cm", 82],
    ["1.412 kcal", 1412], ["5 mg/dL", 5], ["12,5 %", 12.5], ["-1,5", -1.5], ["+3", 3],
  ])("%s -> %s", (s, n) => expect(parseDecimal(s)).toBe(n));
  it.each([
    "", "abc", "<5", ">10", "≤ 0,5", "≥ 60", "1/80", "1:160", "10 a 20", "3,5 x 10^6", "1.412.5", "1,412.5", "-", "cm 82", "5 mg/dL 3",
  ])("%j -> null", (s) => expect(parseDecimal(s)).toBeNull());
});

describe("toLabsDraft", () => {
  it("converte número em pt-BR e referências", () => {
    const [r] = labs([result({ value: "1.412,5", ref_low: "0", ref_high: "" })]).results;
    expect(r.value).toBe(1412.5);
    expect(r.value_text).toBe("1.412,5");
    expect(r.ref_low).toBe(0);
    expect(r.ref_high).toBeNull();
  });
  it("valor com < fica só como texto", () => {
    const [r] = labs([result({ value: "<5" })]).results;
    expect(r.value).toBeNull();
    expect(r.value_text).toBe("<5");
  });
  it("valor com ≤ fica só como texto (não entra no gráfico nem na contagem)", () => {
    const [r] = labs([result({ value: "≤ 0,5", ref_low: "", ref_high: "1/80" })]).results;
    expect(r.value).toBeNull();
    expect(r.value_text).toBe("≤ 0,5");
    expect(r.ref_high).toBeNull();
  });
  it("valor não numérico fica só como texto", () => {
    const [r] = labs([result({ value: "Negativo" })]).results;
    expect(r.value).toBeNull();
    expect(r.value_text).toBe("Negativo");
  });
  it("data vira ISO ao meio-dia UTC; vazia fica vazia", () => {
    expect(labs([]).collected_at).toBe("2026-03-10T12:00:00.000Z");
    expect(labs([], "").collected_at).toBe("");
  });
});

describe("validateLabReport", () => {
  it("exige a data da coleta", () => {
    expect(validateLabReport(labs([result({ value: "90" })], ""))).toBe("Informe a data da coleta.");
  });
  it("aceita um laudo válido e rejeita futuro, código e excesso", () => {
    expect(validateLabReport(labs([result({ value: "90" })]))).toBeNull();
    expect(validateLabReport({ ...labs([result({})]), collected_at: "2999-01-01T00:00:00.000Z" })).toMatch(/futuro/);
    expect(validateLabReport(labs([result({ code: "xyz" })]))).toBe("Exame desconhecido.");
    expect(validateLabReport(labs(Array.from({ length: 81 }, () => result({}))))).toMatch(/80/);
    expect(validateLabReport(labs([result({ name: "x".repeat(121) })]))).toMatch(/longo/);
  });
});

describe("body comp", () => {
  const base = { measured_on: "2026-03-10", device: "InBody 270" };
  it("0 vira null", () => {
    const d = toBodyCompDraft({ ...base, weight_kg: 71.8, fat_pct: 0, fat_kg: 0, muscle_kg: 0, lean_kg: 0, visceral: 0, bmr_kcal: 0, water_l: 0, ecw_tbw: 0, phase_angle: 0 });
    expect(d.weight_kg).toBe(71.8);
    expect(d.fat_pct).toBeNull();
    expect(d.measured_at).toBe("2026-03-10T12:00:00.000Z");
  });
  it("valida faixas e aceita tudo nulo com data e aparelho", () => {
    const d = toBodyCompDraft({ ...base });
    expect(validateBodyComp(d)).toBeNull();
    expect(validateBodyComp({ ...d, fat_pct: 90 })).toMatch(/Gordura/);
    expect(validateBodyComp({ ...d, device: "" })).toBe("Informe o aparelho.");
    expect(validateBodyComp({ ...d, measured_at: "" })).toBe("Informe a data da medição.");
  });
});

describe("canSave", () => {
  it("só Pro salva", () => {
    expect(canSave(false)).toBe("Exames e composição corporal são recursos Pro.");
    expect(canSave(true)).toBeNull();
  });
});

describe("LAB_CODES", () => {
  it("bate com src/data/labs.json", () => {
    const file = join(dirname(fileURLToPath(import.meta.url)), "../../src/data/labs.json");
    const codes = (JSON.parse(readFileSync(file, "utf8")) as { code: string }[]).map((l) => l.code);
    expect([...codes].sort()).toEqual([...LAB_CODES].sort());
  });
});
