import { describe, expect, it } from "vitest";
import type { Recipe } from "./firebase";
import { TACO } from "./foods";
import { drinkMl, fluidLabel, isAlcohol, isDrinkName, mealDrinkMl } from "./fluids";
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
      "Caju, suco concentrado, envasado", "Suco concentrado de uva", "Leite, de coco", "Leite de coco", "Bolo de café", "Sorvete de café",
      "Pudim de café", "Biscoito de chá", "Bala de café", "Doce de café",
    ]) expect(drinkMl(named(n), 200), n).toBeNull();
  });

  it("suplemento só conta se o nome diz shake ou bebida", () => {
    const sup = (name: string) => ({ name, source: "suplemento" as const });
    expect(drinkMl(sup("Body Coffee Protein (café com TCM)"), 30)).toBeNull();
    expect(drinkMl(sup("Supercoffee 3.0 Vanilla Latte"), 10)).toBeNull();
    expect(drinkMl(sup("+Mu Bebida Láctea com Whey"), 250)).toBe(250);
    expect(drinkMl(sup("Shake proteico de baunilha"), 300)).toBe(300);
  });

  it("chá de erva-doce continua contando", () => {
    expect(isDrinkName("Chá de erva-doce")).toBe(true);
  });

  it("sólido só exclui quando abre o nome", () => {
    expect(drinkMl(named("Café doce"), 200)).toBe(200);
    expect(drinkMl(named("Chá doce"), 200)).toBe(200);
    expect(drinkMl(named("Mate doce"), 300)).toBe(300);
    for (const n of ["Bolo de café", "Sorvete de café", "Doce de leite"]) expect(drinkMl(named(n), 200), n).toBeNull();
    expect(drinkMl(named("Chá de erva-doce"), 200)).toBe(200);
  });

  it("item marcado como bebida vence a regra do suplemento, mas não o álcool", () => {
    expect(drinkMl({ name: "Body Coffee Protein (café com TCM)", source: "suplemento", drink: true }, 250)).toBe(250);
    expect(drinkMl({ name: "Cerveja de whey", source: "suplemento", drink: true }, 250)).toBeNull();
  });

  it("grafias brasileiras de álcool não contam", () => {
    for (const n of ["Licor de café", "Chá com conhaque", "Chope", "Chopp claro", "Uísque", "Vodca", "Espumante", "Champanhe", "Sidra", "Saquê", "Caipiroska"]) {
      expect(isAlcohol(n), n).toBe(true);
      expect(drinkMl({ name: n, source: "taco", drink: true }, 200), n).toBeNull();
    }
  });

  it("vitamina com número (D3, B12) é suplemento, não bebida", () => {
    for (const n of ["Vitamina D3", "Vitamina B12", "Vitamina C"]) expect(drinkMl(named(n), 10), n).toBeNull();
    expect(drinkMl(named("Vitamina de banana"), 300)).toBe(300);
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

describe("fluidLabel", () => {
  it("total e água pura", () => {
    expect(fluidLabel(1600, 1100)).toBe("1,6 L · 1,1 L de água");
    expect(fluidLabel(1100, 1100)).toBe("1,1 L");
    expect(fluidLabel(1649, 1600)).toBe("1,6 L");
  });
});
