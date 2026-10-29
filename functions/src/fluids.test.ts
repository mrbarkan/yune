import { describe, expect, it } from "vitest";
import { mealDrinkMl } from "./fluids.js";

describe("mealDrinkMl", () => {
  it("soma só o ml numérico dos itens", () => {
    expect(mealDrinkMl([{ ml: 200 }, { ml: "x" }, {}])).toBe(200);
    expect(mealDrinkMl([{ ml: 150 }, { ml: 50 }, null, 3])).toBe(200);
  });
  it("ignora ml negativo ou não finito", () => {
    expect(mealDrinkMl([{ ml: -100 }, { ml: Number.NaN }, { ml: Infinity }, { ml: 100 }])).toBe(100);
  });
  it("devolve 0 quando items não é lista", () => {
    expect(mealDrinkMl(null)).toBe(0);
    expect(mealDrinkMl(undefined)).toBe(0);
    expect(mealDrinkMl({ ml: 200 })).toBe(0);
    expect(mealDrinkMl("200")).toBe(0);
  });
});
