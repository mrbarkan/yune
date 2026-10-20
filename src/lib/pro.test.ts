import { describe, expect, it } from "vitest";
import { isActive, proStatus } from "./pro";
import type { Entitlements } from "./firebase";

const now = new Date("2026-10-19T12:00:00Z");
const ent = (p: Partial<Entitlements>): Entitlements => ({ pro: false, until: null, ...p });
const stripe = (p: Partial<NonNullable<Entitlements["stripe"]>>) => ({
  status: "active", until: "2026-11-10T00:00:00Z", cancel_at_period_end: false, trial_end: null, ...p,
});

describe("isActive", () => {
  it("falso quando until é ontem", () => expect(isActive(ent({ pro: true, until: "2026-10-18T12:00:00Z" }), now)).toBe(false));
  it("verdadeiro com pro e sem until", () => expect(isActive(ent({ pro: true }), now)).toBe(true));
  it("verdadeiro com until no futuro", () => expect(isActive(ent({ pro: true, until: "2026-10-20T00:00:00Z" }), now)).toBe(true));
  it("falso sem pro", () => expect(isActive(ent({}), now)).toBe(false));
});

describe("proStatus", () => {
  it("trial usa trial_end", () => {
    const r = proStatus(ent({ pro: true, stripe: stripe({ status: "trialing", trial_end: "2026-10-26T00:00:00Z" }) }), now);
    expect(r).toEqual({ status: "trial", until: "2026-10-26T00:00:00Z" });
  });
  it("active com cancel_at_period_end é canceling", () => {
    expect(proStatus(ent({ pro: true, stripe: stripe({ cancel_at_period_end: true }) }), now))
      .toEqual({ status: "canceling", until: "2026-11-10T00:00:00Z" });
  });
  it("active é active", () => expect(proStatus(ent({ pro: true, stripe: stripe({}) }), now).status).toBe("active"));
  it("past_due", () => expect(proStatus(ent({ pro: true, stripe: stripe({ status: "past_due" }) }), now).status).toBe("past_due"));
  it("beta futuro", () => {
    expect(proStatus(ent({ pro: true, source: "beta", beta_until: "2026-11-10T00:00:00Z" }), now))
      .toEqual({ status: "beta", until: "2026-11-10T00:00:00Z" });
  });
  it("tudo vencido é none", () => {
    const r = proStatus(ent({ beta_until: "2026-10-01T00:00:00Z", stripe: stripe({ status: "canceled", until: "2026-10-01T00:00:00Z" }) }), now);
    expect(r).toEqual({ status: "none", until: null });
  });
  it("stripe vencido não conta, beta decide", () => {
    const r = proStatus(ent({ beta_until: "2026-11-10T00:00:00Z", stripe: stripe({ until: "2026-10-01T00:00:00Z" }) }), now);
    expect(r.status).toBe("beta");
  });
  it("beta até 10/11 e stripe em teste até 10/11 é trial", () => {
    const r = proStatus(ent({ pro: true, beta_until: "2026-11-10T00:00:00Z",
      stripe: stripe({ status: "trialing", until: "2026-11-10T00:00:00Z", trial_end: "2026-11-10T00:00:00Z" }) }), now);
    expect(r).toEqual({ status: "trial", until: "2026-11-10T00:00:00Z" });
  });
});
