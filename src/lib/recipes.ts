import type { FoodItem, Recipe, RecipeUnit } from "./firebase";
import { searchText, type Food, type Portion } from "./foods";

export const UNIT_LABEL: Record<RecipeUnit, string> = { ml: "ml", g: "g", porcoes: "porções" };

export function recipeTotals(items: FoodItem[]) {
  const t = { grams: 0, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const it of items) {
    t.grams += it.grams;
    t.kcal += it.kcal;
    t.protein_g += it.protein_g;
    t.carbs_g += it.carbs_g;
    t.fat_g += it.fat_g;
  }
  return t;
}

type Yield = Pick<Recipe, "items" | "yield_amount" | "yield_unit">;

/** Gramas de 1 unidade do rendimento: 1 ml ≈ 1 g; 1 porção = peso total / porções. */
export const gramsPerUnit = (r: Yield) => (r.yield_unit === "porcoes" ? recipeTotals(r.items).grams / r.yield_amount : 1);

export const amountToGrams = (r: Yield, amount: number) => amount * gramsPerUnit(r);

/** 200 → "200", 1.5 → "1,5". */
export const fmtAmount = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** O rendimento a salvar: o campo mostra 1 casa (333,33 → "333,3"); enquanto o valor exibido não muda, fica o guardado. */
export const keptYield = (typed: number, stored: number) => (fmtAmount(typed) === fmtAmount(stored) ? stored : typed);

/** 500 ml → "500 ml"; 1 porção → "1 porção" (singular só no 1). */
export const fmtYield = (n: number, u: RecipeUnit) =>
  `${fmtAmount(n)} ${u === "porcoes" && fmtAmount(n) === "1" ? "porção" : UNIT_LABEL[u]}`;

function portions(r: Yield): Portion[] {
  const n = r.yield_amount;
  if (r.yield_unit === "porcoes") {
    const g = gramsPerUnit(r);
    return [{ label: "1 porção", g }, { label: "½ porção", g: g / 2 }];
  }
  const u = r.yield_unit;
  return [
    ...(u === "ml" && n >= 200 ? [{ label: "copo (200 ml)", g: 200 }] : []),
    { label: `metade (${fmtAmount(n / 2)} ${u})`, g: n / 2 },
    { label: `tudo (${fmtAmount(n)} ${u})`, g: n },
  ];
}

/** Receita como alimento da busca: valores por 100 g do que rendeu. */
export function recipeFood(r: Recipe): Food {
  if (!(r.yield_amount > 0)) throw new Error("rendimento inválido");
  const t = recipeTotals(r.items);
  const total = r.yield_amount * gramsPerUnit(r);
  const per100 = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return {
    key: `receita:${r.id}`,
    name: r.name,
    source: "receita",
    recipe_id: r.id,
    kcal: per100(t.kcal),
    protein: per100(t.protein_g),
    carbs: per100(t.carbs_g),
    fat: per100(t.fat_g),
    portions: portions(r),
    search: searchText(r.name),
  };
}

/** "Leite semidesnatado e Banana" (até 40 caracteres). */
export function suggestRecipeName(items: FoodItem[]): string {
  const s = items.slice(0, 2).map((it) => it.name.trim()).filter(Boolean).join(" e ");
  return s.length > 40 ? `${s.slice(0, 39).trimEnd()}…` : s;
}

/** Faixa do rendimento aceita pelas regras do Firestore. */
export const YIELD_MIN = 0.5;
export const YIELD_MAX = 20000;

/** "Fiz mais do que comi": null quando dá para salvar; senão, o aviso. */
export function batchValid(yieldAmount: number, eaten: number): string | null {
  if (!(yieldAmount >= YIELD_MIN && yieldAmount <= YIELD_MAX)) return "Informe quanto rendeu.";
  if (!(eaten > 0)) return "Informe quanto você comeu.";
  if (eaten > yieldAmount) return "Você comeu mais do que rendeu?";
  return null;
}
