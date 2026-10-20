import { describe, expect, it } from "vitest";
import { parseDecimal } from "./num";

describe("parseDecimal", () => {
  it.each([
    ["71,8", 71.8], ["1.412", 1412], ["1.412,5", 1412.5], ["0,36", 0.36], ["0.36", 0.36], ["2", 2], [" 82 cm", 82],
    ["1.412 kcal", 1412], ["5 mg/dL", 5], ["12,5 %", 12.5], ["-1,5", -1.5], ["+3", 3],
  ])("%s -> %s", (s, n) => expect(parseDecimal(s)).toBe(n));
  it.each([
    "", "abc", "<5", ">10", "≤ 0,5", "≥ 60", "1/80", "1:160", "10 a 20", "3,5 x 10^6", "1.412.5", "1,412.5", "-", "cm 82", "5 mg/dL 3",
  ])("%j -> null", (s) => expect(parseDecimal(s)).toBeNull());
});
