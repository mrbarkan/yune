import { describe, expect, it } from "vitest";
import type { FoodItem, Recipe } from "./firebase";
import { nutrition } from "./foods";
import { amountToGrams, batchValid, fmtYield, gramsPerUnit, recipeFood, recipeTotals, suggestRecipeName, UNIT_LABEL } from "./recipes";

const item = (name: string, grams: number, kcal: number): FoodItem => ({ name, quantity: `${grams} g`, grams, kcal, protein_g: 0, carbs_g: 0, fat_g: 0 });
const NOW = "2026-10-28T12:00:00.000Z";

const shake: Recipe = {
  id: "r1",
  name: "Shake",
  items: [item("Leite semidesnatado", 400, 248), item("Banana", 86, 77), item("Nescau", 20, 76), item("Nescau aveia", 20, 74)],
  yield_amount: 500,
  yield_unit: "ml",
  created_at: NOW,
  updated_at: NOW,
};

const feijao: Recipe = { ...shake, id: "r2", name: "Feijão", items: [item("Feijão", 1200, 900)], yield_amount: 6, yield_unit: "porcoes" };

describe("receitas", () => {
  it("soma os itens", () => {
    expect(recipeTotals(shake.items)).toMatchObject({ grams: 526, kcal: 475 });
  });

  it("ml: 200 ml do shake = 200/500 das kcal", () => {
    expect(gramsPerUnit(shake)).toBe(1);
    expect(nutrition(recipeFood(shake), amountToGrams(shake, 200)).kcal).toBe(Math.round((475 * 200) / 500));
  });

  it("ml: copo, metade e tudo", () => {
    const f = recipeFood(shake);
    expect(f.key).toBe("receita:r1");
    expect(f.source).toBe("receita");
    expect(f.recipe_id).toBe("r1");
    expect(f.portions.some((p) => p.label.includes("200 ml"))).toBe(true);
    expect(f.portions.find((p) => p.label.startsWith("metade"))?.g).toBe(250);
    expect(f.portions.find((p) => p.label.startsWith("tudo"))?.g).toBe(500);
  });

  it("ml: sem copo quando rende menos de 200 ml", () => {
    expect(recipeFood({ ...shake, yield_amount: 150 }).portions.some((p) => p.label.startsWith("copo"))).toBe(false);
  });

  it("g: metade e tudo", () => {
    const f = recipeFood({ ...shake, yield_unit: "g", yield_amount: 600 });
    expect(f.portions).toEqual([{ label: "metade (300 g)", g: 300 }, { label: "tudo (600 g)", g: 600 }]);
  });

  it("porções: 1 porção = rendimento total / número de porções", () => {
    expect(gramsPerUnit(feijao)).toBe(200);
    const f = recipeFood(feijao);
    expect(f.portions[0]).toEqual({ label: "1 porção", g: 200 });
    expect(f.portions[1]).toEqual({ label: "½ porção", g: 100 });
    expect(nutrition(f, 200).kcal).toBe(150);
    expect(amountToGrams(feijao, 2)).toBe(400);
  });

  it("rendimento 0 não vira divisão por zero", () => {
    expect(() => recipeFood({ ...shake, yield_amount: 0 })).toThrow("rendimento inválido");
  });

  it("nome sugerido: os dois primeiros itens", () => {
    expect(suggestRecipeName(shake.items.slice(0, 3))).toBe("Leite semidesnatado e Banana");
    expect(suggestRecipeName([item("Banana", 86, 77)])).toBe("Banana");
    const long = suggestRecipeName([item("Iogurte natural desnatado com mel", 170, 100), item("Granola sem açúcar", 30, 120)]);
    expect(long).toHaveLength(40);
    expect(long.endsWith("…")).toBe(true);
  });

  it("rótulos das unidades", () => {
    expect(UNIT_LABEL).toEqual({ ml: "ml", g: "g", porcoes: "porções" });
  });

  it("fiz mais do que comi: rendeu e comi conferidos antes de salvar", () => {
    expect(batchValid(500, 200)).toBeNull();
    expect(batchValid(500, 500)).toBeNull();
    expect(batchValid(0, 200)).toBe("Informe quanto rendeu.");
    expect(batchValid(500, 0)).toBe("Informe quanto você comeu.");
    expect(batchValid(500, 600)).toBe("Você comeu mais do que rendeu?");
    expect(batchValid(Number.NaN, 200)).toBe("Informe quanto rendeu.");
    // A regra do Firestore exige rendimento de 0,5 a 20000.
    expect(batchValid(0.4, 0.2)).toBe("Informe quanto rendeu.");
    expect(batchValid(0.5, 0.5)).toBeNull();
    expect(batchValid(20000, 200)).toBeNull();
    expect(batchValid(20001, 200)).toBe("Informe quanto rendeu.");
  });
});

describe("fmtYield", () => {
  it("usa o singular só para 1 porção", () => {
    expect(fmtYield(1, "porcoes")).toBe("1 porção");
    expect(fmtYield(2, "porcoes")).toBe("2 porções");
    expect(fmtYield(0.5, "porcoes")).toBe("0,5 porções");
    expect(fmtYield(1, "ml")).toBe("1 ml");
    expect(fmtYield(500, "ml")).toBe("500 ml");
    expect(fmtYield(1.25, "g")).toBe("1,3 g");
  });
});
