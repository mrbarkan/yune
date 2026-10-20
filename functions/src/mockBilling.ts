// Cobrança simulada para o passeio no navegador: SÓ no emulador de Functions, num projeto demo-*, sem STRIPE_SECRET_KEY.
import { COUNTING, deriveEntitlement, trialFor, type StripeState, type Trial } from "./entitlement.js";
import type { Db } from "./billing.js"; // só tipo: sem import circular em runtime

export function mockBillingEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FUNCTIONS_EMULATOR === "true" && /^demo-/.test(env.GCLOUD_PROJECT ?? "") && !env.STRIPE_SECRET_KEY;
}

export const MOCK_PRICES = {
  monthly: { amount: 1990, currency: "brl" }, // R$ 19,90
  annual: { amount: 19900, currency: "brl" }, // R$ 199,00
} as const;

const DAY = 86_400_000;

/** Estado "da Stripe" simulado, pela mesma regra de teste (trialFor) do Checkout real. */
export function mockStripeState(trial: Trial, betaUntil: string | null, plan: "monthly" | "annual", now: Date): StripeState {
  if (trial === "beta" && betaUntil) return { status: "trialing", until: betaUntil, cancel_at_period_end: false, trial_end: betaUntil };
  if (trial === "7d") {
    const end = new Date(now.getTime() + 7 * DAY).toISOString();
    return { status: "trialing", until: end, cancel_at_period_end: false, trial_end: end };
  }
  const end = new Date(now);
  if (plan === "annual") end.setUTCFullYear(end.getUTCFullYear() + 1);
  else end.setUTCMonth(end.getUTCMonth() + 1);
  return { status: "active", until: end.toISOString(), cancel_at_period_end: false, trial_end: null };
}

/** Grava entitlements pela mesma derivação do webhook, numa transação. Não grava customer_id (assim uma chave real depois não tenta sincronizar um customer falso). */
export async function mockCheckout(db: Db, a: { uid: string; plan: "monthly" | "annual"; appUrl: string; now: Date }):
  Promise<{ url: string } | { error: string }> {
  const entRef = db.doc(`entitlements/${a.uid}`);
  const billingRef = db.doc(`billing/${a.uid}`);
  return db.runTransaction(async (tx) => {
    const ent = await tx.get(entRef);
    const bill = await tx.get(billingRef);
    const current = ent.get("stripe") as StripeState | null | undefined;
    if (current && COUNTING.has(current.status)) return { error: "Você já tem o Pro." };
    const beta_until = (ent.get("beta_until") as string | null | undefined) ?? null;
    const trial = trialFor({ beta_until, trial_used: bill.get("trial_used") === true }, a.now);
    const stripe = mockStripeState(trial, beta_until, a.plan, a.now);
    tx.set(entRef, { stripe, ...deriveEntitlement({ beta_until, stripe }, a.now) }, { merge: true });
    tx.set(billingRef, { mock: true, subscription_id: `mock_${a.plan}`, ...(trial !== "none" ? { trial_used: true } : {}) }, { merge: true });
    return { url: `${a.appUrl}/?pro=ok` };
  });
}

export const mockPortalUrl = (appUrl: string) => `${appUrl}/?mock=portal`; // o app ignora o parâmetro; a URL mostra de onde veio
