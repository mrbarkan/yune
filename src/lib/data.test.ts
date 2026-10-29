import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({}));

import { EMPTY, totals } from "./data";
import type { Meal, Water } from "./firebase";

const meal = (items: Meal["items"]): Meal => ({
  id: "m1", eaten_at: "2026-10-28T12:00:00.000Z", description: "Almoço", kcal: 500, protein_g: null, carbs_g: null, fat_g: null,
  items, source: "manual", place: "casa", photo_path: null,
});
const water = (ml: number) => ({ id: `w${ml}`, drank_at: "2026-10-28T13:00:00.000Z", ml }) as Water;
const item = (ml?: number) => ({ name: "x", quantity: "", grams: 200, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...(ml ? { ml } : {}) });

describe("totals", () => {
  it("bebidas das refeições somam no líquido, água pura à parte", () => {
    const t = totals({ ...EMPTY, water: [water(500), water(250)], meals: [meal([item(200), item()]), meal(null)] });
    expect(t.waterMl).toBe(750);
    expect(t.drinksMl).toBe(200);
    expect(t.fluidMl).toBe(950);
  });
  it("sem bebidas, líquido = água", () => {
    const t = totals({ ...EMPTY, water: [water(300)] });
    expect(t).toMatchObject({ waterMl: 300, drinksMl: 0, fluidMl: 300 });
  });
});
