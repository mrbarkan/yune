import { describe, expect, it, vi } from "vitest";
import { handleEvent, subscriptionTrial, syncCustomer } from "./billing.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const sec = (iso: string) => Date.parse(iso) / 1000;

const sub = (o: Record<string, unknown> = {}) => ({
  id: "sub_1", status: "active", created: 100, cancel_at_period_end: false, trial_start: null, trial_end: null,
  items: { data: [{ current_period_end: sec("2026-11-19T12:00:00.000Z") }] }, ...o,
});

// Só o que o código usa: doc(path).get()/set(data, { merge }) e runTransaction (tx.get/tx.set). O merge do
// Firestore é profundo; aqui os objetos aninhados (stripe) são sempre escritos inteiros, então o merge raso dá
// o mesmo resultado. `log` registra a ordem (leitura e escrita na transação, listagem na Stripe).
function memDb(init: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map(Object.entries(init).map(([k, v]) => [k, structuredClone(v)]));
  const writes: string[] = [];
  const log: string[] = [];
  const read = (path: string) => {
    const d = docs.get(path);
    return { get: (f: string) => (d ? structuredClone(d[f]) : undefined) };
  };
  const write = (path: string, data: Record<string, unknown>, opts: { merge: boolean }) => {
    writes.push(path);
    docs.set(path, opts.merge ? { ...docs.get(path), ...structuredClone(data) } : structuredClone(data));
  };
  type Ref = { path: string };
  return {
    docs,
    writes,
    log,
    doc(path: string) {
      return {
        path,
        async get() {
          return read(path);
        },
        async set(data: Record<string, unknown>, opts: { merge: boolean }) {
          log.push(`set ${path}`);
          write(path, data, opts);
        },
      };
    },
    // Como no Firestore: as escritas da transação só valem quando a função termina.
    async runTransaction<T>(fn: (tx: { get(ref: Ref): Promise<{ get(f: string): unknown }>; set(ref: Ref, data: Record<string, unknown>, opts: { merge: boolean }): unknown }) => Promise<T>) {
      const pending: (() => void)[] = [];
      const result = await fn({
        async get(ref) {
          log.push(`tx.get ${ref.path}`);
          return read(ref.path);
        },
        set(ref, data, opts) {
          log.push(`tx.set ${ref.path}`);
          pending.push(() => write(ref.path, data, opts));
        },
      });
      pending.forEach((w) => w());
      return result;
    },
  };
}

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
