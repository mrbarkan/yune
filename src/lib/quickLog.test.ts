import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FoodItem, Meal } from "./firebase";

const calls: { fn: string; args: unknown[] }[] = [];
vi.mock("firebase/firestore", () => ({
  addDoc: async (...args: unknown[]) => { calls.push({ fn: "addDoc", args }); return { id: "novo" }; },
  setDoc: async (...args: unknown[]) => { calls.push({ fn: "setDoc", args }); },
  getDoc: async (ref: string) => ({ exists: () => ref === "day_reviews/2026-10-27", data: () => ({ closed: ["slot:Jantar"] }) }),
  arrayUnion: (...v: unknown[]) => ({ union: v }),
}));
vi.mock("./firebase", () => ({
  table: (n: string) => n,
  row: (n: string, id: string) => `${n}/${id}`,
}));
import { closeInReview, copyMeal, loadReview, mealFields } from "./quickLog";

const item = (name: string, kcal: number, protein_g: number, extra: Partial<FoodItem> = {}): FoodItem => ({
  name, quantity: "1 porção", grams: 100, kcal, protein_g, carbs_g: 1.04, fat_g: 0.5, ...extra,
});
// 12:30 em São Paulo.
const AT = "2026-10-27T15:30:00.000Z";

beforeEach(() => { calls.length = 0; });

describe("mealFields", () => {
  it("soma os itens, arredonda as macros e junta os nomes", () => {
    const items = [item("A", 200, 10.04), item("B", 150, 2)];
    expect(mealFields(items, AT, "casa", "manual", null)).toEqual({
      eaten_at: AT, description: "A, B", kcal: 350, protein_g: 12, carbs_g: 2.1, fat_g: 1, items, source: "manual", place: "casa", photo_path: null,
    });
  });

  it("sem nome nos itens, a descrição é o nome da refeição pelo horário", () => {
    expect(mealFields([item("", 100, 1)], AT, "restaurante", "ai", "meal-photos/u/x.jpg").description).toBe("Almoço");
  });

  it("descrição cortada em 600 caracteres", () => {
    expect(mealFields([item("x".repeat(400), 1, 0), item("y".repeat(400), 1, 0)], AT, "casa", "manual", null).description).toHaveLength(600);
  });
});

describe("copyMeal", () => {
  const meal: Meal = {
    id: "m1", eaten_at: "2026-10-20T19:00:00.000Z", description: "Iogurte", kcal: 120, protein_g: 6, carbs_g: 1.04, fat_g: 0.5,
    items: [item("Iogurte", 120, 6, { ml: 170 })], source: "ai", place: "delivery", photo_path: "meal-photos/u/old.jpg",
  };

  it("grava os itens no novo horário, sem a foto, com created_at", async () => {
    expect(await copyMeal(meal, AT)).toBe("novo");
    const [col, data] = calls[0].args as [string, Record<string, unknown>];
    expect(col).toBe("meals");
    expect(data).toMatchObject({ eaten_at: AT, description: "Iogurte", kcal: 120, items: meal.items, source: "ai", place: "delivery", photo_path: null });
    expect(data.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });

  it("refeição antiga sem lugar fica em casa", async () => {
    await copyMeal({ ...meal, place: undefined as unknown as Meal["place"] }, AT);
    expect((calls[0].args[1] as Meal).place).toBe("casa");
  });
});

describe("revisão do dia", () => {
  it("closeInReview junta a chave com merge", async () => {
    await closeInReview("2026-10-27", "slot:Café da manhã");
    const [ref, data, opts] = calls[0].args as [string, { updated_at: string; closed: unknown }, object];
    expect(ref).toBe("day_reviews/2026-10-27");
    expect(data.closed).toEqual({ union: ["slot:Café da manhã"] });
    expect(data.updated_at).toMatch(/Z$/);
    expect(opts).toEqual({ merge: true });
  });

  it("loadReview devolve as chaves fechadas, ou nada", async () => {
    expect(await loadReview("2026-10-27")).toEqual(["slot:Jantar"]);
    expect(await loadReview("2026-10-26")).toEqual([]);
  });
});
