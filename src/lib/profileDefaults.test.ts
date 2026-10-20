import { describe, expect, it } from "vitest";
import { withGoalDefaults } from "./profileDefaults";

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
