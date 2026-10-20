import { describe, expect, it, vi } from "vitest";
import { memDb } from "./testing/memDb.js";
import { handleEvent, startCheckout, subscriptionTrial, syncCustomer } from "./billing.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const sec = (iso: string) => Date.parse(iso) / 1000;

const sub = (o: Record<string, unknown> = {}) => ({
  id: "sub_1", status: "active", created: 100, cancel_at_period_end: false, trial_start: null, trial_end: null,
  items: { data: [{ current_period_end: sec("2026-11-19T12:00:00.000Z") }] }, ...o,
});

const lister = (...lists: unknown[][]) => {
  const list = vi.fn();
  for (const data of lists) list.mockResolvedValueOnce({ data });
  return { subscriptions: { list } };
};

describe("syncCustomer", () => {
  it("lista e grava dentro da transação, depois de ler (travar) o entitlement", async () => {
    const db = memDb();
    const stripe = lister();
    stripe.subscriptions.list.mockImplementationOnce(async () => (db.log.push("list"), { data: [sub()] }));
    await syncCustomer(stripe, db, "u1", "cus_1", now);
    expect(db.log).toEqual(["tx.get entitlements/u1", "list", "tx.set entitlements/u1", "tx.set billing/u1"]);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ pro: true, source: "stripe" });
  });

  it("é idempotente", async () => {
    const db = memDb();
    const stripe = lister([sub()], [sub()]);
    await syncCustomer(stripe, db, "u1", "cus_1", now);
    const first = structuredClone(db.docs.get("entitlements/u1"));
    await syncCustomer(stripe, db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toEqual(first);
    expect(first).toEqual({
      stripe: { status: "active", until: "2026-11-19T12:00:00.000Z", cancel_at_period_end: false, trial_end: null },
      pro: true, until: "2026-11-19T12:00:00.000Z", source: "stripe",
    });
    expect(stripe.subscriptions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "all", limit: 100 });
  });

  it("evento antigo chegando tarde: vale o estado atual da Stripe", async () => {
    const db = memDb();
    await syncCustomer(lister([sub()]), db, "u1", "cus_1", now);
    await syncCustomer(lister([sub({ status: "canceled" })]), db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ pro: false, until: null, source: null, stripe: { status: "canceled" } });
  });

  it("preserva o beta", async () => {
    const db = memDb({ "entitlements/u1": { beta_until: "2026-12-01T12:00:00.000Z", pro: true, until: "2026-12-01T12:00:00.000Z", source: "beta" } });
    await syncCustomer(lister([sub()]), db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ beta_until: "2026-12-01T12:00:00.000Z", pro: true, until: "2026-12-01T12:00:00.000Z", source: "beta" });
    await syncCustomer(lister([]), db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ beta_until: "2026-12-01T12:00:00.000Z", pro: true, source: "beta", stripe: null });
  });

  it("ignora incompletas e marca trial_used", async () => {
    const db = memDb();
    const subs = [
      sub({ id: "sub_new", status: "incomplete", created: 300 }),
      sub({ id: "sub_old", status: "canceled", created: 100, trial_start: sec("2026-01-01T00:00:00.000Z"), trial_end: sec("2026-01-08T00:00:00.000Z") }),
      sub({ id: "sub_mid", status: "trialing", created: 200, trial_start: sec("2026-10-18T00:00:00.000Z"), trial_end: sec("2026-10-25T00:00:00.000Z") }),
    ];
    await syncCustomer(lister(subs), db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ pro: true, source: "stripe", stripe: { status: "trialing", trial_end: "2026-10-25T00:00:00.000Z" } });
    expect(db.docs.get("billing/u1")).toEqual({ customer_id: "cus_1", subscription_id: "sub_mid", trial_used: true });
  });

  it("prefere a assinatura que dá Pro a uma mais nova cancelada", async () => {
    const db = memDb();
    await syncCustomer(lister([sub({ id: "sub_b", status: "canceled", created: 200 }), sub({ id: "sub_a", created: 100 })]), db, "u1", "cus_1", now);
    expect(db.docs.get("entitlements/u1")).toMatchObject({ pro: true, stripe: { status: "active" } });
    expect(db.docs.get("billing/u1")).toMatchObject({ subscription_id: "sub_a" });
  });

  it("sem teste não grava trial_used", async () => {
    const db = memDb({ "billing/u1": { customer_id: "cus_1", trial_used: true } });
    await syncCustomer(lister([sub()]), db, "u1", "cus_1", now);
    expect(db.docs.get("billing/u1")).toEqual({ customer_id: "cus_1", subscription_id: "sub_1", trial_used: true });
    const fresh = memDb();
    await syncCustomer(lister([sub()]), fresh, "u1", "cus_1", now);
    expect(fresh.docs.get("billing/u1")).toEqual({ customer_id: "cus_1", subscription_id: "sub_1" });
  });
});

describe("handleEvent", () => {
  const event = (type: string, object: Record<string, unknown>) => ({ id: "evt_1", type, data: { object } }) as never;
  const deps = (subsLists: unknown[][], customer: Record<string, unknown> = { id: "cus_1", metadata: { uid: "u1" } }) => {
    const db = memDb();
    const stripe = { ...lister(...subsLists), customers: { retrieve: vi.fn().mockResolvedValue(customer) } };
    return { db, stripe, now };
  };

  it("evento repetido dá o mesmo documento", async () => {
    const d = deps([[sub()], [sub()]]);
    const e = event("customer.subscription.updated", sub({ customer: "cus_1" }));
    await handleEvent(e, d);
    const first = structuredClone(d.db.docs.get("entitlements/u1"));
    await handleEvent(e, d);
    expect(d.db.docs.get("entitlements/u1")).toEqual(first);
    expect(first).toMatchObject({ pro: true, source: "stripe" });
    expect(d.stripe.customers.retrieve).toHaveBeenCalledWith("cus_1");
  });

  it("updated antigo depois do deleted reflete o estado atual", async () => {
    const d = deps([[sub({ status: "canceled" })], [sub({ status: "canceled" })]]);
    await handleEvent(event("customer.subscription.deleted", sub({ status: "canceled", customer: "cus_1" })), d);
    // o evento atrasado ainda diz "active", mas a sincronização relê as assinaturas na Stripe
    await handleEvent(event("customer.subscription.updated", sub({ status: "active", customer: "cus_1" })), d);
    expect(d.db.docs.get("entitlements/u1")).toMatchObject({ pro: false, stripe: { status: "canceled" } });
  });

  it("fatura com customer expandido também sincroniza", async () => {
    const d = deps([[sub({ status: "past_due" })]]);
    await handleEvent(event("invoice.payment_failed", { id: "in_1", customer: { id: "cus_1" } }), d);
    expect(d.stripe.customers.retrieve).toHaveBeenCalledWith("cus_1");
    expect(d.db.docs.get("entitlements/u1")).toMatchObject({ pro: true, stripe: { status: "past_due" } });
  });

  it("customer sem metadata.uid não grava nada", async () => {
    const d = deps([[sub()]], { id: "cus_1", metadata: {} });
    await handleEvent(event("invoice.paid", { id: "in_1", customer: "cus_1" }), d);
    expect(d.db.writes).toEqual([]);
    expect(d.stripe.subscriptions.list).not.toHaveBeenCalled();
  });

  it("customer apagado não grava nada", async () => {
    const d = deps([[sub()]], { id: "cus_1", deleted: true });
    await handleEvent(event("customer.subscription.deleted", sub({ customer: "cus_1" })), d);
    expect(d.db.writes).toEqual([]);
  });

  it("outros eventos são ignorados", async () => {
    const d = deps([[sub()]]);
    await handleEvent(event("charge.succeeded", { id: "ch_1", customer: "cus_1" }), d);
    expect(d.stripe.customers.retrieve).not.toHaveBeenCalled();
    expect(d.db.writes).toEqual([]);
  });

  it("erro da Stripe sobe (o webhook responde 500 e a Stripe tenta de novo)", async () => {
    const d = deps([]);
    d.stripe.subscriptions.list.mockRejectedValueOnce(new Error("rede"));
    await expect(handleEvent(event("invoice.paid", { id: "in_1", customer: "cus_1" }), d)).rejects.toThrow("rede");
    expect(d.db.writes).toEqual([]);
  });
});

describe("subscriptionTrial", () => {
  it("beta: o teste termina quando o beta acaba", () => {
    expect(subscriptionTrial("beta", "2026-11-10T12:00:00.000Z")).toEqual({ trial_end: sec("2026-11-10T12:00:00.000Z") });
  });
  it("7 dias ou nenhum", () => {
    expect(subscriptionTrial("7d", null)).toEqual({ trial_period_days: 7 });
    expect(subscriptionTrial("none", "2026-10-20T12:00:00.000Z")).toEqual({});
  });
});

describe("startCheckout", () => {
  const fakeStripe = (o: { subs?: unknown[]; open?: { id: string }[] } = {}) => ({
    ...lister(o.subs ?? []),
    customers: { create: vi.fn().mockResolvedValue({ id: "cus_new" }) },
    prices: { list: vi.fn().mockResolvedValue({ data: [{ id: "price_m" }] }) },
    checkout: {
      sessions: {
        list: vi.fn().mockResolvedValue({ data: o.open ?? [] }),
        expire: vi.fn().mockResolvedValue({}),
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.test/s" }),
      },
    },
  });
  const args = { uid: "u1", email: "a@b.c", plan: "monthly" as const, appUrl: "https://app.test", now };

  it("expira as sessões abertas antes de criar outra (não cobra duas vezes)", async () => {
    const stripe = fakeStripe({ open: [{ id: "cs_a" }, { id: "cs_b" }] });
    const db = memDb({ "billing/u1": { customer_id: "cus_1" } });
    expect(await startCheckout({ stripe, db }, args)).toEqual({ url: "https://checkout.stripe.test/s" });
    expect(stripe.checkout.sessions.list).toHaveBeenCalledWith({ customer: "cus_1", status: "open", limit: 100 });
    expect(stripe.checkout.sessions.expire.mock.calls.map((c) => c[0])).toEqual(["cs_a", "cs_b"]);
    const expireOrder = Math.max(...stripe.checkout.sessions.expire.mock.invocationCallOrder);
    expect(stripe.checkout.sessions.create.mock.invocationCallOrder[0]).toBeGreaterThan(expireOrder);
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it("parâmetros do Checkout: só cartão, pt-BR, URLs de volta e teste de 7 dias", async () => {
    const stripe = fakeStripe();
    await startCheckout({ stripe, db: memDb() }, args);
    expect(stripe.customers.create).toHaveBeenCalledWith({ email: "a@b.c", metadata: { uid: "u1" } }, { idempotencyKey: "customer-u1" });
    expect(stripe.prices.list).toHaveBeenCalledWith({ lookup_keys: ["yune_pro_monthly"], active: true, limit: 1 });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: "u1",
      line_items: [{ price: "price_m", quantity: 1 }],
      allowed_payment_method_types: ["card"],
      locale: "pt-BR",
      success_url: "https://app.test/?pro=ok",
      cancel_url: "https://app.test/?pro=cancel",
      subscription_data: { trial_period_days: 7 },
    });
  });

  it("beta: o teste vai até o fim do beta", async () => {
    const stripe = fakeStripe();
    const db = memDb({ "entitlements/u1": { beta_until: "2026-11-10T12:00:00.000Z" } });
    await startCheckout({ stripe, db }, args);
    expect(stripe.checkout.sessions.create.mock.calls[0][0]).toMatchObject({ subscription_data: { trial_end: sec("2026-11-10T12:00:00.000Z") } });
  });

  it("quem já tem o Pro não ganha outra sessão (e as abertas expiram)", async () => {
    const stripe = fakeStripe({ subs: [sub()], open: [{ id: "cs_a" }] });
    const db = memDb({ "billing/u1": { customer_id: "cus_1" } });
    expect(await startCheckout({ stripe, db }, args)).toEqual({ error: "Você já tem o Pro." });
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith("cs_a");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("erro ao expirar não cria sessão nova", async () => {
    const stripe = fakeStripe({ open: [{ id: "cs_a" }] });
    stripe.checkout.sessions.expire.mockRejectedValueOnce(new Error("já concluída"));
    const db = memDb({ "billing/u1": { customer_id: "cus_1" } });
    await expect(startCheckout({ stripe, db }, args)).rejects.toThrow("já concluída");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});
