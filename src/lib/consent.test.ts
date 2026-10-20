import { describe, expect, it, vi } from "vitest";
import { grantAndRun, hasAiConsent } from "./consent";

describe("hasAiConsent (app)", () => {
  it("falso sem consentimento", () => {
    expect(hasAiConsent({})).toBe(false);
    expect(hasAiConsent({ ai_consent: null })).toBe(false);
  });
  it("falso com versão 0 ou sem data", () => {
    expect(hasAiConsent({ ai_consent: { at: "2026-10-20T10:00:00.000Z", version: 0 } })).toBe(false);
    expect(hasAiConsent({ ai_consent: { version: 1 } as never })).toBe(false);
  });
  it("verdadeiro com data e versão 1", () => {
    expect(hasAiConsent({ ai_consent: { at: "2026-10-20T10:00:00.000Z", version: 1 } })).toBe(true);
  });
});

describe("grantAndRun", () => {
  it("Concordo grava, executa e depois avisa o pai", async () => {
    const calls: string[] = [];
    await grantAndRun(async () => { calls.push("grant"); }, () => calls.push("run"), () => calls.push("granted"));
    expect(calls).toEqual(["grant", "run", "granted"]);
  });
  it("gravar falhou: lança, não executa nem avisa", async () => {
    const run = vi.fn();
    const onGranted = vi.fn();
    await expect(grantAndRun(async () => { throw new Error("x"); }, run, onGranted)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
    expect(onGranted).not.toHaveBeenCalled();
  });
});
