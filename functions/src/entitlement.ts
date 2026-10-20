// Pro a partir das duas fontes, mantidas separadas em entitlements/{uid}: `beta_until` (script do beta) e
// `stripe` (webhook). pro/until = a mais tardia das duas. Mesmo formato de StripeState em src/lib/firebase.ts.
import type Stripe from "stripe";

export type StripeState = { status: string; until: string; cancel_at_period_end: boolean; trial_end: string | null };
export type Entitlement = { pro: boolean; until: string | null; source: "stripe" | "beta" | null };
export type Trial = "7d" | "beta" | "none";

/** Status em que a assinatura dá Pro (past_due: a Stripe ainda está tentando cobrar). */
export const COUNTING = new Set(["trialing", "active", "past_due"]);
const INCOMPLETE = new Set(["incomplete", "incomplete_expired"]);
/** A Stripe exige trial_end pelo menos 48 h no futuro. */
const MIN_TRIAL_MS = 48 * 3600 * 1000;

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const after = (date: string | null | undefined, ms: number) => !!date && Date.parse(date) > ms;

export function isIncomplete(sub: Pick<Stripe.Subscription, "status">) {
  return INCOMPLETE.has(sub.status);
}

/** Nas versões atuais da API o fim do período fica no item, não na assinatura. */
export function stripeStateFrom(sub: Stripe.Subscription | null): StripeState | null {
  if (!sub || isIncomplete(sub)) return null;
  const end = sub.items.data[0]?.current_period_end;
  if (!end) return null;
  return {
    status: sub.status,
    until: iso(end),
    cancel_at_period_end: sub.cancel_at_period_end,
    trial_end: sub.trial_end ? iso(sub.trial_end) : null,
  };
}

export function deriveEntitlement(src: { beta_until: string | null; stripe: StripeState | null }, now: Date): Entitlement {
  const t = now.getTime();
  const stripe = src.stripe && COUNTING.has(src.stripe.status) && after(src.stripe.until, t) ? src.stripe.until : null;
  const beta = after(src.beta_until, t) ? src.beta_until : null;
  // Empate fica com a Stripe (é o que o app mostra como "teste"/"assinatura").
  if (stripe && (!beta || Date.parse(stripe) >= Date.parse(beta))) return { pro: true, until: stripe, source: "stripe" };
  if (beta) return { pro: true, until: beta, source: "beta" };
  return { pro: false, until: null, source: null };
}

/** Teste no Checkout: o beta conta como teste; 7 dias só para quem nunca teve teste nem beta. */
export function trialFor(src: { beta_until: string | null | undefined; trial_used: boolean }, now: Date): Trial {
  if (after(src.beta_until, now.getTime() + MIN_TRIAL_MS)) return "beta";
  if (!src.trial_used && !src.beta_until) return "7d";
  return "none";
}
