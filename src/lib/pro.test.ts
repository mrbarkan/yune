import { describe, expect, it } from "vitest";
import { canUse, isActive, proStatus, proStatusLine, stripeActive } from "./pro";
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

describe("proStatusLine", () => {
  const tz = "America/Sao_Paulo";
  it("active", () => expect(proStatusLine({ status: "active", until: "2026-11-19T15:00:00Z" }, tz)).toBe("Pro até 19/11"));
  it("trial", () => expect(proStatusLine({ status: "trial", until: "2026-10-26T15:00:00Z" }, tz)).toBe("Teste grátis até 26/10"));
  it("plano anual: mostra o ano", () => expect(proStatusLine({ status: "active", until: "2027-10-20T15:00:00Z" }, tz, new Date("2026-10-20T15:00:00Z"))).toBe("Pro até 20/10/2027"));
  it("canceling", () => expect(proStatusLine({ status: "canceling", until: "2026-11-19T15:00:00Z" }, tz)).toBe("Cancelado — Pro até 19/11"));
  it("beta usa o fuso (01:00Z do dia 19 ainda é dia 18 em SP)", () =>
    expect(proStatusLine({ status: "beta", until: "2026-11-19T01:00:00Z" }, tz)).toBe("Pro do beta até 18/11"));
  it("past_due e none", () => {
    expect(proStatusLine({ status: "past_due", until: null }, tz)).toBe("Pagamento pendente — atualize o cartão");
    expect(proStatusLine({ status: "none", until: null }, tz)).toBeNull();
  });
});

describe("stripeActive", () => {
  it("só beta -> falso", () => expect(stripeActive(ent({ pro: true, source: "beta", beta_until: "2026-11-10T00:00:00Z" }), now)).toBe(false));
  it("padrão FREE -> falso", () => expect(stripeActive(ent({}), now)).toBe(false));
  it("stripe vigente -> verdadeiro", () => expect(stripeActive(ent({ pro: true, stripe: stripe({}) }), now)).toBe(true));
  it("trialing e past_due contam", () => {
    expect(stripeActive(ent({ stripe: stripe({ status: "trialing" }) }), now)).toBe(true);
    expect(stripeActive(ent({ stripe: stripe({ status: "past_due" }) }), now)).toBe(true);
  });
  it("vencida ou cancelada -> falso", () => {
    expect(stripeActive(ent({ stripe: stripe({ until: "2026-10-18T00:00:00Z" }) }), now)).toBe(false);
    expect(stripeActive(ent({ stripe: stripe({ status: "canceled" }) }), now)).toBe(false);
  });
});

describe("canUse com o beta fechado", () => {
  const day = 86_400_000;
  const iso = (d: number) => new Date(Date.now() + d).toISOString();
  it("sem Pro: falso", () => expect(canUse(ent({ pro: false, until: null }), "labs", false)).toBe(false));
  it("Pro até amanhã: verdadeiro", () => expect(canUse(ent({ pro: true, until: iso(day) }), "labs", false)).toBe(true));
  it("Pro vencido ontem: falso", () => expect(canUse(ent({ pro: true, until: iso(-day) }), "labs", false)).toBe(false));
  it("com o beta aberto, qualquer um usa", () => expect(canUse(ent({ pro: false }), "labs", true)).toBe(true));
});
