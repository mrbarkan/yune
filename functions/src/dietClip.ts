// Limita o plano devolvido pelo modelo antes de gravar: tamanhos, quantidades e faixas.
type Obj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : v);
const clamp = (v: unknown, lo: number, hi: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(hi, Math.max(lo, n));
};
const inRange = (v: unknown, lo: number, hi: number) => (typeof v === "number" && v >= lo && v <= hi ? v : null);
const list = (v: unknown, max: number): Obj[] => (Array.isArray(v) ? v.slice(0, max) : []);

export function clipPlan<T>(p: T): T {
  const o = p as Obj;
  const t: Obj = o.targets ?? {};
  return {
    ...o,
    title: str(o.title, 120),
    prescriber: str(o.prescriber, 120),
    issued_on: str(o.issued_on, 40),
    summary: str(o.summary, 600),
    notes: str(o.notes, 1000),
    guidelines: list(o.guidelines, 30).map((g) => str(g, 300)),
    targets: {
      ...t,
      kcal: inRange(t.kcal, 500, 10000),
      protein_g: inRange(t.protein_g, 0, 1000),
      carbs_g: inRange(t.carbs_g, 0, 1000),
      fat_g: inRange(t.fat_g, 0, 1000),
      fiber_g: inRange(t.fiber_g, 0, 200),
      water_ml: inRange(t.water_ml, 0, 10000),
    },
    meals: list(o.meals, 12).map((m) => ({
      ...m,
      name: str(m.name, 60),
      time: str(m.time, 5),
      notes: str(m.notes, 300),
      options: list(m.options, 8).map((op) => ({
        ...op,
        label: str(op.label, 60),
        items: list(op.items, 30).map((it) => ({
          ...it,
          name: str(it.name, 120),
          quantity: str(it.quantity, 80),
          grams: clamp(it.grams, 0, 5000),
          kcal: Math.round(clamp(it.kcal, 0, 5000)),
          protein_g: clamp(it.protein_g, 0, 1000),
          carbs_g: clamp(it.carbs_g, 0, 1000),
          fat_g: clamp(it.fat_g, 0, 1000),
        })),
      })),
    })),
    rules: list(o.rules, 60).map((r) => ({
      ...r,
      name: str(r.name, 120),
      detail: str(r.detail, 300),
      max_per_day: inRange(r.max_per_day, 0, 10000),
    })),
  } as T;
}
