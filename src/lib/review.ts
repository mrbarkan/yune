import type { FoodItem, Meal, Recipe } from "./firebase";
import { snackChips } from "./gaps";
import { norm } from "./norm";
import { recipeItem } from "./recipes";

/** Atalho de um toque: a refeição inteira a repetir, ou um item só (receita, item frequente). */
export type QuickChip = { key: string; label: string; kcal: number } & ({ meal: Meal } | { item: FoodItem });

export const mealChip = (m: Meal): QuickChip => ({ key: `meal:${m.id}`, label: m.description, kcal: m.kcal, meal: m });

/** Itens das refeições (sem porção de receita), mais frequentes primeiro (empate: o mais recente); de cada nome, o mais recente. */
function frequentItems(history: Meal[]): FoodItem[] {
  const groups = new Map<string, { item: FoodItem; at: number; count: number }>();
  for (const m of history) {
    const t = Date.parse(m.eaten_at);
    for (const it of m.items ?? []) {
      const k = norm(it.name);
      if (!k || it.recipe_id || !it.grams) continue;
      const g = groups.get(k);
      if (!g) groups.set(k, { item: it, at: t, count: 1 });
      else {
        g.count++;
        if (t > g.at) Object.assign(g, { item: it, at: t });
      }
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || b.at - a.at).map((g) => g.item);
}

/** Atalhos da folha de lanche: lanches inteiros, até 3 receitas e, com menos de 3, os itens mais frequentes. */
export function snackOptions(history: Meal[], recipes: Recipe[], limit = 6): QuickChip[] {
  const out: QuickChip[] = [];
  const seen = new Set<string>();
  const push = (c: QuickChip) => {
    const k = norm(c.label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };
  snackChips(history, limit).forEach((m) => push(mealChip(m)));
  for (const r of recipes.slice(0, 3)) {
    try {
      const item = recipeItem(r);
      push({ key: `receita:${r.id}`, label: r.name, kcal: item.kcal, item });
    } catch {
      // rendimento inválido
    }
  }
  for (const item of out.length < 3 ? frequentItems(history) : []) {
    if (out.length >= 3) break;
    push({ key: `item:${norm(item.name)}`, label: item.name, kcal: item.kcal, item });
  }
  return out;
}
