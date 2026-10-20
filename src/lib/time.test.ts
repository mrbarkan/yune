import { describe, expect, it } from "vitest";
import { fmtDuration, toLocalInput } from "./time";

describe("time", () => {
  it("toLocalInput usa a hora local", () => {
    expect(toLocalInput(new Date(2026, 9, 19, 8, 5))).toBe("2026-10-19T08:05");
  });
  it("fmtDuration mostra horas e minutos", () => {
    expect(fmtDuration(400)).toBe("6h40");
  });
});
