import { describe, expect, it } from "vitest";
import { avgSleepHours, completion, dayKey, SECTIONS } from "./anamnesis";
import type { Profile } from "./firebase";

const p = (sex: "f" | "m" | null): Profile => ({
  id: "u", name: null, sex, birth_year: null, height_cm: null, weight_kg: null,
  kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480, timezone: "America/Sao_Paulo",
});

describe("completion", () => {
  it("é 0 sem respostas", () => expect(completion({}, p("m"))).toBe(0));
  it("uma de 9 seções visíveis (sexo m) = 11", () => {
    expect(completion({ objetivo: { principal: "Perder peso" } }, p("m"))).toBe(11);
  });
  it("ciclo só conta para sexo f (10 seções)", () => {
    const a = { ciclo: { regular: "Sim" } };
    expect(completion(a, p("m"))).toBe(0);
    expect(completion(a, p("f"))).toBe(10);
  });
  it("texto vazio, lista vazia e null não contam", () => {
    expect(completion({ objetivo: { principal: "  ", detalhe: null }, condicoes: { lista: [] } }, p("m"))).toBe(0);
  });
  it("número 0 conta como resposta", () => {
    expect(completion({ peso: { maior_peso: 0 } }, p("m"))).toBe(11);
  });
});

describe("dayKey", () => {
  it("usa o dia local do fuso", () => {
    expect(dayKey(new Date("2026-10-19T01:30:00Z"), "America/Sao_Paulo")).toBe("2026-10-18");
  });
});

describe("avgSleepHours", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("média das noites dos últimos 14 dias, ignora abertas e antigas", () => {
    const list = [
      { id: "a", bed_at: "2026-10-18T02:00:00Z", wake_at: "2026-10-18T10:00:00Z" },
      { id: "b", bed_at: "2026-10-17T03:00:00Z", wake_at: "2026-10-17T09:00:00Z" },
      { id: "c", bed_at: "2026-10-19T05:00:00Z", wake_at: null },
      { id: "d", bed_at: "2026-09-01T02:00:00Z", wake_at: "2026-09-01T10:00:00Z" },
    ];
    expect(avgSleepHours(list, now)).toBe(7);
  });
  it("sem registros = null", () => expect(avgSleepHours([], now)).toBeNull());
});

describe("SECTIONS", () => {
  it("ordem e chaves", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(
      ["objetivo", "condicoes", "medicamentos", "suplementos", "alergias", "intestino", "rotina", "ciclo", "peso", "alimentacao"]);
  });
});
