import type { FoodItem, Meal, Recipe } from "./firebase";
import { findGaps, isSnackSlot, midpoint, missingSlots, snackChips, type Gap, type MissingSlot } from "./gaps";
import { norm } from "./norm";
import { recipeItem } from "./recipes";
import { mealName } from "./slots";
import { sameDay } from "./time";

/** Atalho de um toque: a refeição inteira a repetir, ou um item só (receita, item frequente). */
export type QuickChip = { key: string; label: string; kcal: number } & ({ meal: Meal } | { item: FoodItem });

/** Rótulo do atalho: nomes longos cortados. */
export const chipLabel = (s: string) => (s.length > 30 ? s.slice(0, 28) + "…" : s);

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

/** Atalhos da folha de lanche: lanches inteiros, até 3 receitas e, com menos de 3, os itens mais frequentes (os de lanche antes). */
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
  // Itens dos lanches e ceias primeiro; os do almoço ("Alface, crespa, crua") só se ainda faltar.
  const snacksOnly = history.filter((m) => isSnackSlot(mealName(new Date(m.eaten_at))));
  for (const item of out.length < 3 ? [...frequentItems(snacksOnly), ...frequentItems(history)] : []) {
    if (out.length >= 3) break;
    push({ key: `item:${norm(item.name)}`, label: item.name, kcal: item.kcal, item });
  }
  return out;
}

export type ReviewRow =
  | { kind: "meal"; key: string; at: string; meal: Meal }
  | { kind: "slot"; key: string; at: string; slot: MissingSlot }
  | { kind: "gap"; key: string; at: string; gap: Gap };

/**
 * Linhas de Fechar o dia, em ordem de horário: refeições do dia, refeições principais faltando e intervalos ainda em aberto.
 * Os intervalos saem das refeições atuais: registrar dentro de um já o divide.
 */
export function reviewRows(meals: Meal[], day: Date, now: Date, window: { start: string; end: string }, closed: string[]): ReviewRow[] {
  const ofDay = meals.filter((m) => sameDay(new Date(m.eaten_at), day));
  const times = ofDay.map((m) => m.eaten_at);
  const shut = new Set(closed);
  const list: ReviewRow[] = [
    ...ofDay.map((m): ReviewRow => ({ kind: "meal", key: m.id, at: m.eaten_at, meal: m })),
    ...missingSlots(times, day, now).filter((s) => !shut.has(s.key)).map((s): ReviewRow => ({ kind: "slot", key: s.key, at: s.at, slot: s })),
    ...findGaps(times, day, now, window).filter((g) => !shut.has(g.key)).map((g): ReviewRow => ({ kind: "gap", key: g.key, at: g.from, gap: g })),
  ];
  // Mesmo horário: a refeição antes do intervalo que começa nela.
  return list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || Number(a.kind !== "meal") - Number(b.kind !== "meal"));
}

/** Pergunta de Fechar o dia (refeição faltando ou intervalo). */
export type ReviewAsk = Exclude<ReviewRow, { kind: "meal" }>;

/** Horário do registro que responde a pergunta: o da refeição faltando, ou o meio do intervalo. */
export const askAt = (r: ReviewAsk) => (r.kind === "slot" ? r.slot.at : midpoint(r.gap.from, r.gap.to));

/**
 * Chaves que um registro em `at` responde: a da pergunta e, num intervalo, a metade que começa no registro.
 * Registrar no meio divide o intervalo; num de 8 h ou mais, sem isso a resposta abriria outra pergunta logo abaixo.
 */
export const answeredKeys = (r: ReviewAsk, at: string): string[] => (r.kind === "gap" ? [r.key, new Date(at).toISOString()] : [r.key]);

/** "Outro…" de Fechar o dia: o dia e as chaves que a refeição salva na folha de comida responde, pelo horário salvo. */
export type PendingReview = { day: string; keys: (loggedAt: string) => string[] };
export const pendingReview = (day: string, r: ReviewAsk): PendingReview => ({ day, keys: (loggedAt) => answeredKeys(r, loggedAt) });
