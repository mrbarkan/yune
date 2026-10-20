import { describe, expect, it } from "vitest";
import { localNow, safeTimeZone } from "./reminderTime.js";

describe("safeTimeZone", () => {
  it("cai no padrão quando inválido ou ausente", () => {
    expect(safeTimeZone("x")).toBe("America/Sao_Paulo");
    expect(safeTimeZone(undefined)).toBe("America/Sao_Paulo");
    expect(safeTimeZone("")).toBe("America/Sao_Paulo");
  });
  it("mantém fusos válidos", () => {
    expect(safeTimeZone("America/Argentina/Buenos_Aires")).toBe("America/Argentina/Buenos_Aires");
    expect(safeTimeZone("UTC")).toBe("UTC");
  });
});

describe("localNow", () => {
  it("calcula data e minutos no fuso", () => {
    expect(localNow("America/Sao_Paulo", new Date("2026-10-19T12:05:00Z"))).toEqual({ date: "2026-10-19", minutes: 545 });
  });
  it("não lança com fuso inválido passado por safeTimeZone", () => {
    expect(() => localNow(safeTimeZone("x"))).not.toThrow();
  });
});
