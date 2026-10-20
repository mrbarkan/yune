import { describe, expect, it } from "vitest";
import { parseDecimal } from "./num";

describe("parseDecimal", () => {
  it.each([
    ["71,8", 71.8], ["1.412", 1412], ["1.412,5", 1412.5], ["0,36", 0.36], ["0.36", 0.36], ["2", 2], [" 82 cm", 82],
  ])("%s -> %s", (s, n) => expect(parseDecimal(s)).toBe(n));
  it.each(["", "abc", "<5", ">10"])("%j -> null", (s) => expect(parseDecimal(s)).toBeNull());
});
