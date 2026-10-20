import { describe, expect, it } from "vitest";
import { memDb } from "./testing/memDb.js";
import { deriveEntitlement } from "./entitlement.js";
import { mockBillingEnabled, mockCheckout } from "./mockBilling.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const appUrl = "http://localhost:8080";
const run = (db: ReturnType<typeof memDb>, plan: "monthly" | "annual" = "monthly") => mockCheckout(db, { uid: "u", plan, appUrl, now });

describe("mockBillingEnabled", () => {
  it("só liga no emulador demo sem chave", () => {
    expect(mockBillingEnabled({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "demo-yune" })).toBe(true);
    expect(mockBillingEnabled({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "demo-yune", STRIPE_SECRET_KEY: "sk_test_x" })).toBe(false);
    expect(mockBillingEnabled({ GCLOUD_PROJECT: "yune-13758" })).toBe(false);
    expect(mockBillingEnabled({ FUNCTIONS_EMULATOR: "true", GCLOUD_PROJECT: "yune-13758" })).toBe(false);
    expect(mockBillingEnabled({ FUNCTIONS_EMULATOR: "1", GCLOUD_PROJECT: "demo-yune" })).toBe(false);
    expect(mockBillingEnabled({})).toBe(false);
    expect(mockBillingEnabled()).toBe(false);
  });
});

describe("mockCheckout", () => {
  it("7 dias para quem nunca teve teste", async () => {
    const db = memDb();
    expect(await run(db)).toEqual({ url: "http://localhost:8080/?pro=ok" });
    const end = "2026-10-26T12:00:00.000Z";
    expect(db.docs.get("entitlements/u")).toEqual({
      stripe: { status: "trialing", until: end, trial_end: end, cancel_at_period_end: false },
      pro: true, until: end, source: "stripe",
    });
    const bill = db.docs.get("billing/u");
    expect(bill).toMatchObject({ trial_used: true, mock: true });
    expect(bill).not.toHaveProperty("customer_id");
  });

  it("beta conta como teste", async () => {
    const beta = "2026-10-29T12:00:00.000Z";
    const db = memDb({ "entitlements/u": { beta_until: beta } });
    await run(db);
    expect(db.docs.get("entitlements/u")).toMatchObject({
      beta_until: beta, stripe: { status: "trialing", until: beta, trial_end: beta }, until: beta, source: "stripe",
    });
  });

  it("beta com menos de 48 h não vira teste", async () => {
    const db = memDb({ "entitlements/u": { beta_until: "2026-10-20T12:00:00.000Z" } });
    await run(db);
    expect(db.docs.get("entitlements/u")).toMatchObject({ stripe: { status: "active", trial_end: null } });
  });

  it("sem teste quando trial_used", async () => {
    const m = memDb({ "billing/u": { trial_used: true } });
    await run(m, "monthly");
    expect(m.docs.get("entitlements/u")).toMatchObject({ stripe: { status: "active", until: "2026-11-19T12:00:00.000Z" } });
    const a = memDb({ "billing/u": { trial_used: true } });
    await run(a, "annual");
    expect(a.docs.get("entitlements/u")).toMatchObject({ stripe: { status: "active", until: "2027-10-19T12:00:00.000Z" } });
  });

  it("quem já tem Pro recebe erro e nada é gravado", async () => {
    const db = memDb({ "entitlements/u": { stripe: { status: "active", until: "2026-11-19T12:00:00.000Z", cancel_at_period_end: false, trial_end: null } } });
    expect(await run(db)).toEqual({ error: "Você já tem o Pro." });
    expect(db.writes).toEqual([]);
  });

  it("derivação é a mesma do webhook", async () => {
    const beta_until = "2026-10-29T12:00:00.000Z";
    const db = memDb({ "entitlements/u": { beta_until } });
    await run(db);
    const e = db.docs.get("entitlements/u") as { stripe: never; pro: boolean; until: string | null; source: string | null };
    expect({ pro: e.pro, until: e.until, source: e.source }).toEqual(deriveEntitlement({ beta_until, stripe: e.stripe }, now));
  });
});
