import { describe, expect, it } from "vitest";
import { deriveEntitlement, stripeStateFrom, trialFor, type StripeState } from "./entitlement.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const sec = (iso: string) => Date.parse(iso) / 1000;
const state = (status: string, until: string, o: Partial<StripeState> = {}): StripeState =>
  ({ status, until, cancel_at_period_end: false, trial_end: null, ...o });
const sub = (o: Record<string, unknown> = {}) => ({
  id: "sub_1", status: "active", created: 1, cancel_at_period_end: false, trial_start: null, trial_end: null,
  items: { data: [{ current_period_end: sec("2026-11-19T12:00:00.000Z") }] }, ...o,
}) as never;

describe("deriveEntitlement", () => {
  it("assinatura ativa conta, fonte stripe", () => {
    expect(deriveEntitlement({ beta_until: null, stripe: state("active", "2026-11-19T12:00:00.000Z") }, now))
      .toEqual({ pro: true, until: "2026-11-19T12:00:00.000Z", source: "stripe" });
  });
  it("cancelada não conta; vale o beta", () => {
    expect(deriveEntitlement({ beta_until: "2026-11-10T12:00:00.000Z", stripe: state("canceled", "2026-11-19T12:00:00.000Z") }, now))
      .toEqual({ pro: true, until: "2026-11-10T12:00:00.000Z", source: "beta" });
  });
  it("vale o mais tardio dos dois", () => {
    const stripe = state("trialing", "2026-11-10T12:00:00.000Z", { trial_end: "2026-11-10T12:00:00.000Z" });
    expect(deriveEntitlement({ beta_until: "2026-11-18T12:00:00.000Z", stripe }, now))
      .toEqual({ pro: true, until: "2026-11-18T12:00:00.000Z", source: "beta" });
    expect(deriveEntitlement({ beta_until: "2026-10-25T12:00:00.000Z", stripe }, now))
      .toEqual({ pro: true, until: "2026-11-10T12:00:00.000Z", source: "stripe" });
  });
  it("pagamento pendente ainda conta", () => {
    expect(deriveEntitlement({ beta_until: null, stripe: state("past_due", "2026-10-25T12:00:00.000Z") }, now).pro).toBe(true);
  });
  it("prazo vencido não conta", () => {
    expect(deriveEntitlement({ beta_until: "2026-10-18T12:00:00.000Z", stripe: state("active", "2026-10-19T11:59:59.000Z") }, now))
      .toEqual({ pro: false, until: null, source: null });
  });
  it("sem nada, sem Pro", () => {
    expect(deriveEntitlement({ beta_until: null, stripe: null }, now)).toEqual({ pro: false, until: null, source: null });
  });
});

describe("stripeStateFrom", () => {
  it("lê o fim do período do item e o fim do teste", () => {
    expect(stripeStateFrom(sub({ status: "trialing", cancel_at_period_end: true, trial_end: sec("2026-10-26T12:00:00.000Z") })))
      .toEqual({ status: "trialing", until: "2026-11-19T12:00:00.000Z", cancel_at_period_end: true, trial_end: "2026-10-26T12:00:00.000Z" });
  });
  it("incompleta ou ausente vira null", () => {
    expect(stripeStateFrom(sub({ status: "incomplete" }))).toBeNull();
    expect(stripeStateFrom(sub({ status: "incomplete_expired" }))).toBeNull();
    expect(stripeStateFrom(null)).toBeNull();
  });
});

describe("trialFor", () => {
  it("beta com mais de 48 h vira o teste", () => {
    expect(trialFor({ beta_until: "2026-10-21T12:00:01.000Z", trial_used: false }, now)).toBe("beta");
  });
  it("beta perto do fim não dá teste nem 7 dias", () => {
    expect(trialFor({ beta_until: "2026-10-21T12:00:00.000Z", trial_used: false }, now)).toBe("none");
    expect(trialFor({ beta_until: "2026-10-01T12:00:00.000Z", trial_used: false }, now)).toBe("none");
  });
  it("7 dias só para quem nunca teve teste nem beta", () => {
    expect(trialFor({ beta_until: null, trial_used: false }, now)).toBe("7d");
    expect(trialFor({ beta_until: undefined, trial_used: false }, now)).toBe("7d");
    expect(trialFor({ beta_until: null, trial_used: true }, now)).toBe("none");
  });
});
