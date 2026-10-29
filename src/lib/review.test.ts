import { describe, expect, it } from "vitest";
import type { FoodItem, Meal, Recipe } from "./firebase";
import { answeredKeys, askAt, chipLabel, reviewRows, snackOptions } from "./review";

// npm test roda com TZ=America/Sao_Paulo: horários abaixo são locais.
const DAY = new Date(2026, 9, 27);
const at = (h: number, m = 0, day = 27) => new Date(2026, 9, day, h, m).toISOString();
const WIN = { start: "09:00", end: "21:00" };
const NIGHT = new Date(2026, 9, 27, 22);

const item = (name: string, kcal = 100, extra: Partial<FoodItem> = {}): FoodItem => ({
  name, quantity: "1 porção", grams: 100, kcal, protein_g: 1, carbs_g: 1, fat_g: 1, ...extra,
});
let n = 0;
const meal = (description: string, eaten_at: string, items: FoodItem[] | null = [item(description)]): Meal => ({
  id: `m${++n}`, eaten_at, description, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, items, source: "manual", place: "casa", photo_path: null,
});
const recipe = (id: string, name: string, yield_amount = 500): Recipe => ({
  id, name, items: [item("Leite", 300, { grams: 500 })], yield_amount, yield_unit: "ml", created_at: at(8), updated_at: at(8),
});

describe("snackOptions", () => {
  it("lanches inteiros primeiro, depois receitas na primeira porção", () => {
    const history = [meal("Iogurte, granola", at(16, 0, 20)), meal("Iogurte, granola", at(16, 0, 21)), meal("Banana", at(16, 0, 22))];
    const chips = snackOptions(history, [recipe("r1", "Shake")]);
    expect(chips.map((c) => c.label)).toEqual(["Iogurte, granola", "Banana", "Shake"]);
    const shake = chips[2];
    expect("item" in shake && shake.item).toMatchObject({ name: "Shake", quantity: "copo (200 ml)", grams: 200, kcal: 120, recipe_id: "r1", ml: 200 });
  });

  it("receita com rendimento inválido fica de fora", () => {
    expect(snackOptions([], [recipe("r1", "Quebrada", 0)])).toEqual([]);
  });

  it("menos de 3 atalhos: completa com os itens mais frequentes (sem os de receita), até 3", () => {
    const history = [
      meal("Arroz, feijão", at(12, 0, 20), [item("Arroz"), item("Feijão")]),
      meal("Arroz, frango", at(12, 0, 21), [item("Arroz", 130), item("Frango")]),
      meal("Feijão", at(12, 0, 22), [item("Feijão")]),
      meal("Shake", at(19, 0, 22), [item("Shake", 120, { recipe_id: "r1" })]),
      meal("Banana", at(16, 0, 23)),
    ];
    const chips = snackOptions(history, []);
    // Empate na contagem: o mais recente primeiro; de cada nome, o item mais recente.
    expect(chips.map((c) => c.label)).toEqual(["Banana", "Feijão", "Arroz"]);
    expect("item" in chips[2] && chips[2].item.kcal).toBe(130);
  });

  it("itens de lanche e ceia antes dos itens das outras refeições", () => {
    const lunch = (d: number) => meal("Arroz, alface", at(12, 0, d), [item("Arroz"), item("Alface, crespa, crua")]);
    const history = [lunch(18), lunch(19), lunch(20), lunch(21), meal("Iogurte, granola", at(16, 0, 22), [item("Iogurte"), item("Granola")])];
    expect(snackOptions(history, []).map((c) => c.label)).toEqual(["Iogurte, granola", "Iogurte", "Granola"]);
  });

  it("sem itens de lanche suficientes, completa com os das outras refeições", () => {
    const history = [
      meal("Arroz, alface", at(12, 0, 20), [item("Arroz"), item("Alface, crespa, crua")]),
      meal("Arroz", at(12, 0, 21), [item("Arroz")]),
      meal("Maçã", at(23, 30, 21), [item("Maçã")]),
    ];
    expect(snackOptions(history, []).map((c) => c.label)).toEqual(["Maçã", "Arroz", "Alface, crespa, crua"]);
  });

  it("não repete o mesmo nome", () => {
    const history = [meal("Banana", at(16, 0, 20)), meal("Banana", at(12, 0, 21))];
    expect(snackOptions(history, [recipe("r1", "banana")]).map((c) => c.label)).toEqual(["Banana"]);
  });
});

describe("reviewRows", () => {
  it("dia vazio: as três refeições principais", () => {
    expect(reviewRows([], DAY, NIGHT, WIN, []).map((r) => r.key)).toEqual(["slot:Café da manhã", "slot:Almoço", "slot:Jantar"]);
  });

  it("refeições e intervalos em ordem de horário; o intervalo vem logo depois da refeição em que começa", () => {
    const meals = [meal("Pão", at(8, 40)), meal("Almoço", at(12, 30)), meal("Jantar", at(20, 10))];
    const rows = reviewRows(meals, DAY, NIGHT, WIN, []);
    expect(rows.map((r) => [r.kind, r.at])).toEqual([
      ["meal", at(8, 40)], ["meal", at(12, 30)], ["gap", at(12, 30)], ["meal", at(20, 10)],
    ]);
    const gap = rows[2];
    expect(gap.kind === "gap" && gap.gap).toEqual({ key: at(12, 30), from: at(12, 30), to: at(20, 10) });
  });

  it("o que já foi respondido some", () => {
    const meals = [meal("Almoço", at(12, 30)), meal("Jantar", at(20, 10))];
    const rows = reviewRows(meals, DAY, NIGHT, WIN, ["slot:Café da manhã", at(12, 30)]);
    expect(rows.map((r) => r.kind)).toEqual(["meal", "meal"]);
  });

  it("refeições de outro dia não entram", () => {
    const rows = reviewRows([meal("Ontem", at(12, 0, 26)), meal("Almoço", at(12)), meal("Jantar", at(19))], DAY, NIGHT, WIN, ["slot:Café da manhã"]);
    expect(rows.map((r) => r.kind)).toEqual(["meal", "gap", "meal"]);
  });

  it("hoje à tarde: o jantar ainda não é perguntado", () => {
    const rows = reviewRows([meal("Café", at(8, 30)), meal("Almoço", at(12))], DAY, new Date(2026, 9, 27, 15, 30), WIN, []);
    expect(rows.map((r) => r.kind)).toEqual(["meal", "meal"]);
  });
});

describe("answeredKeys", () => {
  it("registrar no meio de um intervalo longo fecha as duas metades (não abre outra pergunta)", () => {
    const meals = [meal("Café", at(8)), meal("Jantar", at(20, 30))];
    const [gap] = reviewRows(meals, DAY, NIGHT, WIN, ["slot:Almoço"]).filter((r) => r.kind === "gap");
    expect(gap?.kind).toBe("gap");
    if (gap?.kind !== "gap") return;
    const loggedAt = askAt(gap);
    expect(loggedAt).toBe(at(14, 15));
    const after = [...meals, meal("Iogurte", loggedAt)];
    // Só a chave da pergunta: a metade depois do registro (14:15–20:30) viraria outra pergunta.
    expect(reviewRows(after, DAY, NIGHT, WIN, ["slot:Almoço", gap.key]).filter((r) => r.kind === "gap").map((r) => r.key)).toEqual([loggedAt]);
    const keys = answeredKeys(gap, loggedAt);
    expect(keys).toEqual([at(8), loggedAt]);
    expect(reviewRows(after, DAY, NIGHT, WIN, ["slot:Almoço", ...keys]).filter((r) => r.kind === "gap")).toEqual([]);
  });

  it("refeição faltando: só a própria chave, no horário da faixa", () => {
    const [slot] = reviewRows([], DAY, NIGHT, WIN, []);
    expect(slot?.kind).toBe("slot");
    if (slot?.kind !== "slot") return;
    expect(askAt(slot)).toBe(slot.slot.at);
    expect(answeredKeys(slot, askAt(slot))).toEqual(["slot:Café da manhã"]);
  });
});

describe("chipLabel", () => {
  it("corta nomes longos", () => {
    expect(chipLabel("Iogurte, granola")).toBe("Iogurte, granola");
    expect(chipLabel("a".repeat(31))).toBe("a".repeat(28) + "…");
  });
});
