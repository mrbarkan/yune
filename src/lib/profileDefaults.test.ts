import { describe, expect, it } from "vitest";
import { goalFraction, goalsValid, withGoalDefaults } from "./profileDefaults";

describe("withGoalDefaults", () => {
  it("preenche metas ausentes, nulas, NaN ou zero", () => {
    const p = withGoalDefaults({ id: "u", kcal_goal: undefined, water_goal_ml: NaN, sleep_goal_min: 0 });
    expect(p).toMatchObject({ kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480 });
  });
  it("mantém metas válidas e demais campos", () => {
    const p = withGoalDefaults({ id: "u", name: "A", kcal_goal: 1800, water_goal_ml: 2500, sleep_goal_min: 420 });
    expect(p).toEqual({ id: "u", name: "A", kcal_goal: 1800, water_goal_ml: 2500, sleep_goal_min: 420 });
  });
});

describe("goalsValid", () => {
  it("aceita só metas positivas", () => {
    expect(goalsValid({ kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480 })).toBe(true);
    expect(goalsValid({ kcal_goal: 0, water_goal_ml: 2000, sleep_goal_min: 480 })).toBe(false);
    expect(goalsValid({ kcal_goal: 2000, water_goal_ml: NaN, sleep_goal_min: 480 })).toBe(false);
    expect(goalsValid({ kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: -60 })).toBe(false);
  });
});

describe("goalFraction", () => {
  it("meta ausente, zero ou NaN dá 0", () => {
    for (const g of [undefined, null, 0, NaN]) expect(goalFraction(0, g)).toBe(0);
  });
  it("calcula e limita a 1", () => {
    expect(goalFraction(500, 2000)).toBe(0.25);
    expect(goalFraction(3000, 2000)).toBe(1);
  });
  it("nunca NaN", () => expect(goalFraction(NaN, 2000)).toBe(0));
});
