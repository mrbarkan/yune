import { useEffect, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { rows, table, type DietMeal, type DietPlan, type DietRule } from "./firebase";
import { norm } from "./foods";
import { fmtNum } from "./time";

/** Dieta ativa (a mais recente, se houver mais de uma). */
export function useDietPlan(enabled: boolean, version: number) {
  const [plan, setPlan] = useState<DietPlan | null>(null);
  useEffect(() => {
    if (!enabled) return setPlan(null);
    let alive = true;
    getDocs(query(table("diet_plans"), where("active", "==", true)))
      .then((snap) => alive && setPlan(rows<DietPlan>(snap).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, version]);
  return plan;
}

// Palavra inteira, ou começo de palavra para termos longos: "sal" não pega "salada", "refrigerante" pega "refrigerantes".
export function ruleMatches(rule: DietRule, name: string) {
  const words = norm(name).split(" ");
  return rule.keywords.some((k) => {
    const terms = norm(k).split(" ").filter(Boolean);
    return terms.length > 0 && terms.every((t) => words.some((w) => w === t || (t.length >= 5 && w.startsWith(t))));
  });
}

type Eaten = { name: string; grams: number; quantity?: string; times?: number };

// Quantas vezes: no prato vem `times`; no histórico, do texto da quantidade ("2 × unidade").
const timesOf = (it: Eaten) => it.times ?? Number(/^(\d+(?:,\d+)?) ×/.exec(it.quantity ?? "")?.[1].replace(",", ".") ?? 1);
export type DietWarning = { rule: DietRule; text: string; items: string[] };

const UNIT = { g: "g", ml: "ml", vezes: "vez(es)" } as const;

/**
 * Avisos da dieta para o dia. Com `plate`, só avisa sobre o que está no prato (somando o que já foi comido para os limites).
 * Não bloqueia nada: quem decide é a pessoa.
 */
export function dietWarnings(plan: DietPlan, day: Eaten[], plate?: Eaten[]): DietWarning[] {
  const out: DietWarning[] = [];
  for (const rule of plan.rules) {
    if (rule.kind === "prefer") continue;
    const now = (plate ?? day).filter((it) => ruleMatches(rule, it.name));
    if (!now.length) continue;
    const items = [...new Set(now.map((it) => it.name))];
    if (rule.kind === "avoid") {
      out.push({ rule, items, text: `Sua dieta pede para evitar: ${rule.name}.` });
      continue;
    }
    const all = plate ? [...day.filter((it) => ruleMatches(rule, it.name)), ...now] : now;
    if (rule.max_per_day != null && rule.unit) {
      const used = all.reduce((s, it) => s + (rule.unit === "vezes" ? timesOf(it) : it.grams), 0);
      if (used > rule.max_per_day) {
        out.push({ rule, items, text: `${rule.name}: ${fmtNum(used)} ${UNIT[rule.unit]} hoje, a dieta permite até ${fmtNum(rule.max_per_day)}.` });
      }
    } else if (plate) {
      out.push({ rule, items, text: `${rule.name} com limite: ${rule.detail}` });
    }
  }
  return out;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Refeição da dieta para este horário: pelo horário mais próximo, ou pelo nome ("Almoço", "Lanche"…). */
export function mealFor(plan: DietPlan, at: Date, label: string): DietMeal | null {
  const now = at.getHours() * 60 + at.getMinutes();
  const timed = plan.meals.filter((m) => m.time && /^\d{1,2}:\d{2}$/.test(m.time));
  if (timed.length) {
    const dist = (m: DietMeal) => {
      const d = Math.abs(minutes(m.time!) - now);
      return Math.min(d, 1440 - d);
    };
    return timed.reduce((a, b) => (dist(b) < dist(a) ? b : a));
  }
  const want = norm(label);
  return plan.meals.find((m) => norm(m.name).startsWith(want)) ?? null;
}

export const optionKcal = (o: DietMeal["options"][number]) => o.items.reduce((s, it) => s + it.kcal, 0);
