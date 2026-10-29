import { describe, expect, it } from "vitest";
import { backfillAt, dayId, fmtDayMonth, fmtDuration, toLocalInput } from "./time";

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

describe("backfillAt", () => {
  const now = new Date(2026, 9, 21, 22, 15);
  it("hoje: mantém o horário dado", () => {
    expect(backfillAt(new Date(2026, 9, 21), new Date(2026, 9, 21, 21, 45), now)).toEqual(new Date(2026, 9, 21, 21, 45));
  });
  it("dia anterior: mesma hora do dia, na data vista", () => {
    expect(backfillAt(new Date(2026, 9, 19), now, now)).toEqual(new Date(2026, 9, 19, 22, 15));
  });
  it("hoje, com horário de ontem (meia-noite há pouco): não muda", () => {
    const at = new Date(2026, 9, 20, 23, 50);
    expect(backfillAt(new Date(2026, 9, 21), at, new Date(2026, 9, 21, 0, 20))).toEqual(at);
  });
});

describe("dayId", () => {
  it("AAAA-MM-DD do dia local, mesmo perto da meia-noite", () => {
    expect(dayId(new Date(2026, 9, 27, 23, 59))).toBe("2026-10-27");
    expect(dayId(new Date(2026, 9, 28, 0, 1))).toBe("2026-10-28");
  });
});
