import { describe, expect, it } from "vitest";
import { shouldRefresh, STALE_MS } from "./refresh";

describe("shouldRefresh", () => {
  const t = new Date(2026, 5, 10, 12, 0, 0).getTime();
  it("não atualiza com 4 min, atualiza com exatos 5 min", () => {
    expect(shouldRefresh(t, t + 4 * 60_000)).toBe(false);
    expect(shouldRefresh(t, t + STALE_MS)).toBe(true);
  });
  it("atualiza ao virar o dia mesmo com 2 min de diferença", () => {
    const a = new Date(2026, 5, 10, 23, 59).getTime();
    const b = new Date(2026, 5, 11, 0, 1).getTime();
    expect(shouldRefresh(a, b)).toBe(true);
  });
  it("não atualiza no mesmo dia com 1 min", () => {
    expect(shouldRefresh(t, t + 60_000)).toBe(false);
  });
});
