import { describe, expect, it } from "vitest";
import type { Recipe } from "./firebase";
import { TACO } from "./foods";
import { drinkMl, isAlcohol, isDrinkName, mealDrinkMl } from "./fluids";
import { recipeFood } from "./recipes";

const named = (name: string) => ({ name, source: "taco" as const });

describe("bebidas", () => {
  it("contam", () => {
    expect(drinkMl(named("Café coado (sem açúcar)"), 200)).toBe(200);
    expect(drinkMl(named("Suco de laranja"), 300)).toBe(300);
    expect(drinkMl(named("Leite integral"), 200)).toBe(200);
    for (const n of ["Água de coco", "Shake de whey", "Vitamina de banana"]) expect(isDrinkName(n), n).toBe(true);
  });

  it("não contam", () => {
    for (const n of [
      "Cerveja pilsen", "Caipirinha", "Cana, aguardente 1", "Salsicha", "Bolacha", "Tomate", "Pudim de leite", "Chocolate ao leite",
      "Doce de leite", "Leite condensado", "Leite em pó", "Achocolatado, pó", "Café, pó, torrado", "Vitamina C", "Caldo de carne, tablete", "Banana",
    ]) expect(drinkMl(named(n), 200), n).toBeNull();
  });

  it("álcool nunca conta, mesmo marcado como bebida", () => {
    expect(isAlcohol("Cerveja, pilsen 2")).toBe(true);
    expect(isAlcohol("Gin tônica")).toBe(true);
    expect(drinkMl({ name: "Vinho tinto", source: "taco", drink: true }, 150)).toBeNull();
  });

  it("alimento da TACO marcado como bebida conta", () => {
    expect(drinkMl({ name: "Coco água de", source: "taco", drink: true }, 250.4)).toBe(250);
    const cola = TACO.find((f) => f.name.startsWith("Refrigerante tipo cola"));
    expect(cola?.drink).toBe(true);
    expect(TACO.find((f) => /aguardente/.test(f.name))?.drink).toBeFalsy();
    expect(TACO.find((f) => /^Arroz/.test(f.name))?.drink).toBeFalsy();
  });

  it("receita em ml conta", () => {
    const r: Recipe = {
      id: "r1", name: "Batida verde", items: [{ name: "Couve", quantity: "1 folha", grams: 30, kcal: 8, protein_g: 0, carbs_g: 0, fat_g: 0 }],
      yield_amount: 500, yield_unit: "ml", created_at: "2026-10-28T12:00:00.000Z", updated_at: "2026-10-28T12:00:00.000Z",
    };
    expect(recipeFood(r).drink).toBe(true);
    expect(drinkMl(recipeFood(r), 200)).toBe(200);
    expect(drinkMl({ name: "Batida verde", source: "receita", unit: "ml" }, 200)).toBe(200);
    expect(recipeFood({ ...r, yield_unit: "g" }).drink).toBe(false);
  });

  it("soma o ml dos itens da refeição", () => {
    const it = (ml?: number) => ({ name: "x", quantity: "", grams: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...(ml ? { ml } : {}) });
    expect(mealDrinkMl([it(200), it(), it(50)])).toBe(250);
    expect(mealDrinkMl(null)).toBe(0);
    expect(mealDrinkMl(undefined)).toBe(0);
  });
});
