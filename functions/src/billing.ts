// Assinatura Pro pela Stripe: Checkout, Portal do cliente, preços e webhook.
// billing/{uid} = { customer_id, subscription_id, trial_used } — só o servidor lê e escreve.
// entitlements/{uid} é sempre reconstruído do estado atual das assinaturas na Stripe (nunca de deltas do evento),
// então evento repetido ou fora de ordem dá o mesmo resultado. `beta_until` nunca é tocado aqui.
import { getFirestore } from "firebase-admin/firestore";
import { defineSecret, defineString } from "firebase-functions/params";
import { onCall, onRequest } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { COUNTING, deriveEntitlement, isIncomplete, stripeStateFrom, trialFor, type StripeState, type Trial } from "./entitlement.js";
import { REGION } from "./region.js";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const APP_URL = defineString("APP_URL");

const PRICES = { monthly: "yune_pro_monthly", annual: "yune_pro_annual" } as const;

/** Só o que o código usa do Firestore (os testes passam um stub em memória). */
type DocRef = {
  get(): Promise<{ get(field: string): unknown }>;
  set(data: Record<string, unknown>, options: { merge: boolean }): Promise<unknown>;
};
type Tx = {
  get(ref: DocRef): Promise<{ get(field: string): unknown }>;
  set(ref: DocRef, data: Record<string, unknown>, options: { merge: boolean }): unknown;
};
export type Db = {
  doc(path: string): DocRef;
  runTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
};
type SubscriptionLister = {
  subscriptions: { list(params: Stripe.SubscriptionListParams): PromiseLike<{ data: Stripe.Subscription[] }> };
};
type CustomerReader = {
  customers: { retrieve(id: string): PromiseLike<Stripe.Customer | Stripe.DeletedCustomer> };
};

/**
 * Relê as assinaturas do customer e regrava entitlements/{uid} (merge; beta_until fica como está).
 * Tudo numa transação, lendo o entitlement antes de listar: o servidor trava o documento, então quando
 * created/paid/updated chegam juntos quem listou por último grava por último (a outra tentativa é refeita).
 */
export async function syncCustomer(stripe: SubscriptionLister, db: Db, uid: string, customerId: string, now: Date) {
  const entRef = db.doc(`entitlements/${uid}`);
  const billingRef = db.doc(`billing/${uid}`);
  await db.runTransaction(async (tx) => {
    const beta_until = ((await tx.get(entRef)).get("beta_until") as string | null | undefined) ?? null;
    const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    const subs = data.filter((s) => !isIncomplete(s)).sort((a, b) => b.created - a.created);
    // A mais nova que dá Pro; senão a mais nova. Assim uma segunda assinatura cancelada não tira o Pro de quem paga.
    const sub = subs.find((s) => COUNTING.has(s.status)) ?? subs[0] ?? null;
    const stripeState = stripeStateFrom(sub);

    tx.set(entRef, { stripe: stripeState, ...deriveEntitlement({ beta_until, stripe: stripeState }, now) }, { merge: true });
    const trialUsed = subs.some((s) => s.trial_start != null);
    tx.set(
      billingRef,
      { customer_id: customerId, subscription_id: sub?.id ?? null, ...(trialUsed ? { trial_used: true } : {}) },
      { merge: true },
    );
  });
}

const SYNC_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** Trata um evento já verificado. Lança em erro de rede/Firestore para o webhook responder 500 e a Stripe reenviar. */
export async function handleEvent(event: Stripe.Event, deps: { stripe: SubscriptionLister & CustomerReader; db: Db; now: Date }) {
  if (!SYNC_EVENTS.has(event.type)) return;
  const object = event.data.object as { customer?: string | { id: string } | null };
  const customerId = typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (!customerId) return;
  const customer = await deps.stripe.customers.retrieve(customerId);
  const uid = customer.deleted ? undefined : customer.metadata?.uid;
  if (!uid) {
    console.warn("stripeWebhook: customer sem uid", event.type, event.id);
    return;
  }
  await syncCustomer(deps.stripe, deps.db, uid, customerId, deps.now);
}

/** Campos de teste para subscription_data do Checkout. */
export function subscriptionTrial(trial: Trial, betaUntil: string | null): { trial_end?: number; trial_period_days?: number } {
  if (trial === "beta" && betaUntil) return { trial_end: Math.floor(Date.parse(betaUntil) / 1000) };
  if (trial === "7d") return { trial_period_days: 7 };
  return {};
}

// Versão da API: a fixada pelo SDK (não passar apiVersion).
const client = () => new Stripe(STRIPE_SECRET_KEY.value());
const appUrl = () => APP_URL.value().replace(/\/+$/, "");
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function trialOf(db: Db, uid: string, now: Date) {
  const [ent, bill] = await Promise.all([db.doc(`entitlements/${uid}`).get(), db.doc(`billing/${uid}`).get()]);
  const beta_until = (ent.get("beta_until") as string | null | undefined) ?? null;
  return { beta_until, trial: trialFor({ beta_until, trial_used: bill.get("trial_used") === true }, now) };
}

export const stripeWebhook = onRequest(
  { region: REGION, secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = client();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, req.get("stripe-signature") ?? "", STRIPE_WEBHOOK_SECRET.value());
    } catch {
      res.status(400).send("Assinatura inválida.");
      return;
    }
    try {
      await handleEvent(event, { stripe, db: getFirestore(), now: new Date() });
      res.status(200).send("ok");
    } catch (err) {
      // Só tipo, id e mensagem: nada de cartão ou dados pessoais no log.
      console.error("stripeWebhook", event.type, event.id, message(err));
      res.status(500).send("erro");
    }
  },
);

const NOT_SIGNED_IN = { error: "Faça login para continuar." };

// Como as outras funções do Yune, devolve sempre um objeto: `{ url }` ou `{ error }`.
export const createCheckout = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) return NOT_SIGNED_IN;
  const uid = req.auth.uid;
  const plan = (req.data as { plan?: unknown } | null)?.plan;
  if (plan !== "monthly" && plan !== "annual") return { error: "Plano inválido." };

  const stripe = client();
  const db = getFirestore();
  const now = new Date();
  try {
    const billingRef = db.doc(`billing/${uid}`);
    let customerId = (await billingRef.get()).get("customer_id") as string | undefined;
    // Já tem customer: relê a Stripe antes de decidir (cobre webhook perdido e evita cobrar duas vezes).
    if (customerId) await syncCustomer(stripe, db, uid, customerId, now);
    const state = (await db.doc(`entitlements/${uid}`).get()).get("stripe") as StripeState | null | undefined;
    if (state && COUNTING.has(state.status)) return { error: "Você já tem o Pro." };

    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: req.auth.token.email, metadata: { uid } },
        { idempotencyKey: `customer-${uid}` },
      );
      customerId = customer.id;
      await billingRef.set({ customer_id: customerId }, { merge: true });
    }

    const price = (await stripe.prices.list({ lookup_keys: [PRICES[plan]], active: true, limit: 1 })).data[0];
    if (!price) return { error: "Assinatura indisponível no momento." };

    const { beta_until, trial } = await trialOf(db, uid, now);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: uid,
      line_items: [{ price: price.id, quantity: 1 }],
      // Só cartão. Na API atual o campo é allowed_payment_method_types (payment_method_types saiu do Checkout).
      allowed_payment_method_types: ["card"],
      locale: "pt-BR",
      success_url: `${appUrl()}/?pro=ok`,
      cancel_url: `${appUrl()}/?pro=cancel`,
      subscription_data: subscriptionTrial(trial, beta_until),
    });
    if (!session.url) return { error: "Não foi possível abrir o pagamento agora." };
    return { url: session.url };
  } catch (err) {
    console.error("createCheckout", message(err));
    return { error: "Não foi possível abrir o pagamento agora." };
  }
});

export const createPortal = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) return NOT_SIGNED_IN;
  const customerId = (await getFirestore().doc(`billing/${req.auth.uid}`).get()).get("customer_id") as string | undefined;
  if (!customerId) return { error: "Você ainda não tem uma assinatura." };
  try {
    const session = await client().billingPortal.sessions.create({ customer: customerId, return_url: appUrl() });
    return { url: session.url };
  } catch (err) {
    console.error("createPortal", message(err));
    return { error: "Não foi possível abrir a assinatura agora." };
  }
});

/** Preços lidos da Stripe (centavos) e o teste a que a pessoa tem direito (o app não lê billing/). */
export const getProPrices = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY] }, async (req) => {
  if (!req.auth || req.auth.token.email_verified !== true) return NOT_SIGNED_IN;
  try {
    const { data } = await client().prices.list({ lookup_keys: Object.values(PRICES), active: true, limit: 10 });
    const amount = (key: string) => {
      const p = data.find((x) => x.lookup_key === key);
      return p && p.unit_amount != null ? { amount: p.unit_amount, currency: p.currency } : null;
    };
    const monthly = amount(PRICES.monthly);
    const annual = amount(PRICES.annual);
    if (!monthly || !annual) return { error: "Assinatura indisponível no momento." };
    const { trial } = await trialOf(getFirestore(), req.auth.uid, new Date());
    return { monthly, annual, trial };
  } catch (err) {
    console.error("getProPrices", message(err));
    return { error: "Não foi possível carregar os preços agora." };
  }
});
