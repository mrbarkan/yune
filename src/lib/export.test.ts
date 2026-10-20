import { describe, expect, it } from "vitest";
import { exportFileName, exportTables, fmtLocal, pdfText, type ExportData } from "./export";
import type { Profile } from "./firebase";

const profile: Profile = {
  id: "u", name: "Ana", sex: "f", birth_year: 1990, height_cm: 165, weight_kg: 60,
  kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480, timezone: "America/Sao_Paulo",
};
const empty: ExportData = {
  profile, meals: [], water: [], sleep: [], activities: [], measurements: [], bodyComp: [], labs: [], anamnesis: [], diet: [],
};
const NAMES = ["Perfil", "Refeições", "Água", "Sono", "Movimento", "Medidas", "Composição corporal", "Exames", "Questionário", "Dieta"];
const tz = "America/Sao_Paulo";

describe("export", () => {
  it("formata data local dd/mm/aaaa HH:mm no fuso", () => {
    expect(fmtLocal("2026-10-19T01:05:00.000Z", tz)).toBe("18/10/2026 22:05");
    expect(fmtLocal(null, tz)).toBe("");
  });

  it("nome do arquivo usa o dia local", () => {
    expect(exportFileName(new Date("2026-10-19T01:00:00.000Z"), tz)).toBe("yune-dados-2026-10-18");
  });

  it("coleções vazias geram as abas só com cabeçalho, na ordem", () => {
    const t = exportTables(empty, tz);
    expect(t.map((x) => x.name)).toEqual(NAMES);
    for (const x of t.filter((x) => x.name !== "Perfil")) expect(x.rows).toEqual([]);
    for (const x of t) expect(x.columns.length).toBeGreaterThan(0);
  });

  it("refeição com dois itens vira duas linhas", () => {
    const t = exportTables({
      ...empty,
      meals: [{
        id: "m", eaten_at: "2026-10-19T15:00:00.000Z", description: "Almoço", kcal: 500, protein_g: 20, carbs_g: 60, fat_g: 10,
        items: [
          { name: "Arroz", quantity: "1 porção", grams: 100, kcal: 130, protein_g: 2.5, carbs_g: 28, fat_g: 0.2 },
          { name: "Feijão", quantity: "1 concha", grams: 80, kcal: 70, protein_g: 5, carbs_g: 12, fat_g: 0.5 },
        ],
        source: "manual", place: "casa", photo_path: null,
      }],
    }, tz).find((x) => x.name === "Refeições")!;
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]).toEqual(["19/10/2026 12:00", "Almoço", "Arroz", 100, 130, 2.5, 28, 0.2]);
    expect(t.rows[1].slice(2, 5)).toEqual(["Feijão", 80, 70]);
  });

  it("resultado '<5' aparece como texto", () => {
    const t = exportTables({
      ...empty,
      labs: [{
        id: "l", collected_at: "2026-10-10T12:00:00.000Z", lab: "Lab", file_paths: ["lab-reports/u/x.pdf"], ai: false, created_at: "",
        results: [{ code: "pcr_us", name: "PCR", value: null, value_text: "<5", unit: "mg/L", ref_low: null, ref_high: null, ref_text: "<5" }],
      }],
    }, tz).find((x) => x.name === "Exames")!;
    expect(t.rows).toHaveLength(1);
    expect(t.rows[0]).toContain("<5");
  });

  it("questionário: última versão, campos respondidos e linha de versões", () => {
    const t = exportTables({
      ...empty,
      anamnesis: [
        { id: "a", updated_at: "2026-09-01T12:00:00.000Z", answers: { objetivo: { principal: "Comer melhor" } } },
        { id: "b", updated_at: "2026-10-01T12:00:00.000Z", answers: { objetivo: { principal: "Perder peso", detalhe: "" }, condicoes: { lista: ["Diabetes", "SOP"] } } },
      ],
    }, tz).find((x) => x.name === "Questionário")!;
    const flat = t.rows.map((r) => r.join("|"));
    expect(flat).toContain("Objetivo|Seu principal objetivo|Perder peso");
    expect(flat).toContain("Condições de saúde|Você tem ou já teve|Diabetes, SOP");
    expect(flat.some((r) => r.includes("Comer melhor"))).toBe(false);
    expect(flat.some((r) => r.startsWith("Versões") && r.includes("01/09/2026") && r.includes("01/10/2026"))).toBe(true);
  });

  it("nada menciona body-photos", () => {
    const t = exportTables({ ...empty, meals: [{
      id: "m", eaten_at: "2026-10-19T15:00:00.000Z", description: "x", kcal: 1, protein_g: null, carbs_g: null, fat_g: null,
      items: null, source: "manual", place: "casa", photo_path: "meal-photos/u/a.jpg",
    }] }, tz);
    expect(JSON.stringify(t)).not.toContain("body-photos");
    expect(JSON.stringify(t)).not.toContain("photo");
  });

  it("doc antigo sem data não quebra a exportação", () => {
    const t = exportTables({
      ...empty,
      meals: [
        { id: "a", description: "Antigo", kcal: 100 } as never,
        { id: "b", eaten_at: "2026-10-19T15:00:00.000Z", description: "Normal", kcal: 200, protein_g: 1, carbs_g: 1, fat_g: 1 } as never,
      ],
      sleep: [{ id: "s", bed_at: "2026-10-19T01:00:00.000Z", wake_at: null }],
    }, tz);
    const rows = t.find((x) => x.name === "Refeições")!.rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r[0])).toEqual(["", "19/10/2026 12:00"]);
  });

  it("fmtLocal com data inválida devolve vazio", () => {
    expect(fmtLocal("x", "America/Sao_Paulo")).toBe("");
  });

  it("fuso vazio ou ausente não quebra a formatação", () => {
    expect(() => fmtLocal("2026-10-19T15:00:00.000Z", "")).not.toThrow();
    expect(fmtLocal("2026-10-19T15:00:00.000Z", "")).toMatch(/^19\/10\/2026 \d\d:\d\d$/);
  });

  it("labs sem results, dieta sem targets e sono sem bed_at não quebram", () => {
    const t = exportTables({
      ...empty,
      labs: [{ id: "l", collected_at: "2026-10-19T15:00:00.000Z", lab: "X" } as never],
      diet: [{ id: "d", title: "D", active: true } as never],
      sleep: [{ id: "s", wake_at: "2026-10-19T10:00:00.000Z" } as never],
    }, tz);
    expect(t.find((x) => x.name === "Sono")!.rows[0]![2]).toBeNull();
  });

});

describe("pdfText", () => {
  it("troca sinais de comparação por ASCII em vez de sumir com eles", () => {
    expect(pdfText("Desejável: ≥ 40")).toBe("Desejável: >= 40");
    expect(pdfText("≤ 0,5 · −1,2 · ≠ 3 · ≈ 4")).toBe("<= 0,5 · -1,2 · != 3 · ~ 4");
  });
  it("mantém Latin-1 e tira o que a fonte não tem", () => {
    expect(pdfText("Ação 5 µg/m² — ok 😀")).toBe("Ação 5 µg/m² — ok ");
    expect(pdfText(null)).toBe("");
    expect(pdfText(12.5)).toBe("12,5");
    expect(pdfText(1990)).toBe("1990");
  });
});
