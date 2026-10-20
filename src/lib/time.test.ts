import { describe, expect, it } from "vitest";
import { fmtDayMonth, fmtDuration, toLocalInput } from "./time";

describe("time", () => {
  it("toLocalInput usa a hora local", () => {
    expect(toLocalInput(new Date(2026, 9, 19, 8, 5))).toBe("2026-10-19T08:05");
  });
  it("fmtDuration mostra horas e minutos", () => {
    expect(fmtDuration(400)).toBe("6h40");
  });
});

describe("fmtDayMonth", () => {
  const tz = "America/Sao_Paulo";
  const now = new Date("2026-10-20T15:00:00Z");
  it("mesmo ano: dd/mm", () => expect(fmtDayMonth("2026-11-19T15:00:00Z", tz, now)).toBe("19/11"));
  it("outro ano: dd/mm/aaaa", () => expect(fmtDayMonth("2027-10-20T15:00:00Z", tz, now)).toBe("20/10/2027"));
  it("ano no fuso da pessoa (virada do ano)", () => {
    expect(fmtDayMonth("2027-01-01T01:00:00Z", tz, now)).toBe("31/12");
    expect(fmtDayMonth("2027-01-01T04:00:00Z", tz, now)).toBe("01/01/2027");
  });
});
