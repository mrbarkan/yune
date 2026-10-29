import type { Meal } from "./firebase";
import { norm } from "./norm";
import { mealName } from "./slots";
import { sameDay } from "./time";

/** Intervalo sem registro; a chave é o início (a última refeição). */
export type Gap = { key: string; from: string; to: string };
export type MissingSlot = { key: string; slot: "Café da manhã" | "Almoço" | "Jantar"; at: string };

export const GAP_MS = 4 * 3_600_000;

/** Refeição principal: horário do meio da faixa e a partir de quando se pergunta por ela. */
const SLOTS: { slot: MissingSlot["slot"]; mid: number; ask: number }[] = [
  { slot: "Café da manhã", mid: 8, ask: 11 },
  { slot: "Almoço", mid: 13, ask: 15 },
  { slot: "Jantar", mid: 20, ask: 21 },
];

/** "HH:MM" no dia `day`, hora local. */
const clock = (day: Date, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
};

const ofDay = (mealsAt: string[], day: Date) =>
  mealsAt.map((s) => new Date(s)).filter((d) => sameDay(d, day)).sort((a, b) => a.getTime() - b.getTime());

/** Intervalos de 4 h ou mais entre refeições do dia, e da última até agora (hoje) ou o fim da janela. Sem intervalo antes da primeira. */
export function findGaps(mealsAt: string[], day: Date, now: Date, window: { start: string; end: string }): Gap[] {
  const meals = ofDay(mealsAt, day);
  if (!meals.length) return [];
  const end = clock(day, window.end);
  const last = sameDay(day, now) && now < end ? now : end;
  const gaps: Gap[] = [];
  const add = (a: Date, b: Date) => {
    if (b.getTime() - a.getTime() >= GAP_MS) gaps.push({ key: a.toISOString(), from: a.toISOString(), to: b.toISOString() });
  };
  for (let i = 1; i < meals.length; i++) add(meals[i - 1], meals[i]);
  add(meals[meals.length - 1], last);
  return gaps;
}

/** Café, almoço e jantar sem registro, perguntados só depois da faixa (jantar a partir das 21h). */
export function missingSlots(mealsAt: string[], day: Date, now: Date): MissingSlot[] {
  const names = new Set(ofDay(mealsAt, day).map(mealName));
  return SLOTS.filter((s) => now >= clock(day, `${s.ask}:00`) && !names.has(s.slot))
    .map((s) => ({ key: `slot:${s.slot}`, slot: s.slot, at: clock(day, `${s.mid}:00`).toISOString() }));
}

/** Refeições com itens agrupadas pela descrição: mais frequentes primeiro (empate: a mais recente); devolve a mais recente de cada grupo. */
function chips(history: Meal[], keep: (name: string) => boolean, limit: number): Meal[] {
  const groups = new Map<string, { meal: Meal; count: number }>();
  for (const m of history) {
    if (!m.items?.length || !keep(mealName(new Date(m.eaten_at)))) continue;
    const k = norm(m.description);
    const g = groups.get(k);
    if (!g) groups.set(k, { meal: m, count: 1 });
    else {
      g.count++;
      if (Date.parse(m.eaten_at) > Date.parse(g.meal.eaten_at)) g.meal = m;
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || Date.parse(b.meal.eaten_at) - Date.parse(a.meal.eaten_at))
    .slice(0, limit)
    .map((g) => g.meal);
}

export const snackChips = (history: Meal[], limit = 6) => chips(history, (n) => n === "Lanche" || n === "Ceia", limit);

export const slotChips = (history: Meal[], slot: MissingSlot["slot"], limit = 4) => chips(history, (n) => n === slot, limit);

export const midpoint = (a: string, b: string) => new Date((new Date(a).getTime() + new Date(b).getTime()) / 2).toISOString();
