import { describe, expect, it } from "vitest";
import { hasAiConsent } from "./consent.js";

describe("hasAiConsent (servidor)", () => {
  it("falso sem consentimento", () => {
    expect(hasAiConsent(undefined)).toBe(false);
    expect(hasAiConsent({})).toBe(false);
    expect(hasAiConsent({ ai_consent: null })).toBe(false);
  });
  it("falso com versão 0 ou sem data", () => {
    expect(hasAiConsent({ ai_consent: { at: "2026-10-20T10:00:00.000Z", version: 0 } })).toBe(false);
    expect(hasAiConsent({ ai_consent: { version: 1 } })).toBe(false);
  });
  it("verdadeiro com data e versão 1", () => {
    expect(hasAiConsent({ ai_consent: { at: "2026-10-20T10:00:00.000Z", version: 1 } })).toBe(true);
  });
});
