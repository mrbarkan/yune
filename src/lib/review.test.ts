import { describe, expect, it } from "vitest";
import type { FoodItem, Meal, Recipe } from "./firebase";
import { snackOptions } from "./review";

// npm test roda com TZ=America/Sao_Paulo: horários abaixo são locais.
const at = (h: number, m = 0, day = 27) => new Date(2026, 9, day, h, m).toISOString();

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

  it("não repete o mesmo nome", () => {
    const history = [meal("Banana", at(16, 0, 20)), meal("Banana", at(12, 0, 21))];
    expect(snackOptions(history, [recipe("r1", "banana")]).map((c) => c.label)).toEqual(["Banana"]);
  });
});
