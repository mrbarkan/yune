import type { FoodItem, RecipeUnit } from "./firebase";
import type { Food } from "./foods";
import { norm } from "./norm";
import { fmtLiters } from "./time";

const ALCOHOL = /\b(cervejas?|vinhos?|aguardente|cachaca|pinga|vodka|whiske?y|gin|rum|tequila|drinks?|caipirinhas?)\b/;

// Sólidos que citam café/chá/leite ("Bolo de café", "Doce de leite"); só no começo, para "Café doce" contar.
const SOLID = /^(bolos?|sorvetes?|pudins?|pudim|biscoitos?|bolachas?|balas?|doces?)\b/;

/** Bebida pelo nome: [palavra que conta, exceções]. */
const DRINKS: [RegExp, RegExp?][] = [
  [/\bsucos?\b/, /\bconcentrad/],
  [/\brefrigerantes?\b/],
  [/\bcafe\b/, /\btorrado\b/],
  [/\bcha\b/],
  [/\bleite\b/, /\bcondensado\b|\bem po\b|\bpudim\b|chocolate ao leite|doce de leite|creme de leite|pao de leite|\bbolo\b|\bmingau\b|arroz doce|\bcanjica\b|\bde coco\b/],
  [/\bagua de coco\b/],
  [/\bbebida\b/],
  [/\bshakes?\b/],
  [/\bvitamina\b/, /\bvitamina [a-e]\b|mistura para vitamina/],
  [/\bisotonic/],
  [/\bkombucha\b/],
  [/\bcapp?uccino\b/],
  [/\bcaldo de cana\b|\bcana caldo\b/],
  [/\blimonada\b/],
  [/\bmate\b/],
  [/\bachocolatado\b/],
  [/\biogurte liquido\b|\bbebida lactea\b/],
];

export const isAlcohol = (name: string) => ALCOHOL.test(norm(name));

/** Nome de bebida que conta como líquido; pó ("Café, pó") e álcool não. */
export function isDrinkName(name: string): boolean {
  const n = norm(name);
  if (/\bpo\b/.test(n) || ALCOHOL.test(n) || SOLID.test(n)) return false;
  return DRINKS.some(([yes, no]) => yes.test(n) && !no?.test(n));
}

/** Quanto do item conta como líquido (ml = g), ou null se não é bebida. */
export function drinkMl(food: Pick<Food, "name" | "drink" | "source"> & { unit?: RecipeUnit }, grams: number): number | null {
  if (isAlcohol(food.name)) return null;
  if (food.drink) return Math.round(grams);
  // Suplemento é pó para misturar: só conta o que já vem pronto para beber.
  if (food.source === "suplemento") return /\b(shakes?|bebida)\b/.test(norm(food.name)) ? Math.round(grams) : null;
  const drink = (food.source === "receita" && food.unit === "ml") || isDrinkName(food.name);
  return drink ? Math.round(grams) : null;
}

export const mealDrinkMl = (items: FoodItem[] | null | undefined) => (items ?? []).reduce((s, it) => s + (it.ml ?? 0), 0);

/** "1,6 L · 1,1 L de água"; só "1,6 L" quando os dois arredondam igual. */
export function fluidLabel(totalMl: number, waterMl: number): string {
  const total = fmtLiters(totalMl);
  const water = fmtLiters(waterMl);
  return total === water ? `${total} L` : `${total} L · ${water} L de água`;
}
