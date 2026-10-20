import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { entitlementsDoc, type Entitlements } from "./firebase";

// Beta: todo mundo tem Pro enquanto não houver cobrança. Desligar junto com PRO_OPEN em functions/src/pro.ts.
const PRO_OPEN = true;

/** Recursos e o plano que libera cada um. Novos recursos pagos entram aqui. */
export const FEATURES = { diet: "pro", labs: "pro", body_comp: "pro" } as const;
export type Feature = keyof typeof FEATURES;

const FREE: Entitlements = { pro: false, until: null };

/** Pro vigente: marcado como pro e dentro do prazo (sem prazo = sem fim). */
export function isActive(ent: Entitlements, now = new Date()) {
  return ent.pro && (!ent.until || ent.until > now.toISOString());
}

export function canUse(ent: Entitlements, feature: Feature) {
  if (FEATURES[feature] !== "pro" || PRO_OPEN) return true;
  return isActive(ent);
}

export type ProStatus = "trial" | "active" | "canceling" | "past_due" | "beta" | "none";

/** O que mostrar em Ajustes: a assinatura (se vigente) vale mais que o beta. */
export function proStatus(ent: Entitlements, now = new Date()): { status: ProStatus; until: string | null } {
  const iso = now.toISOString();
  const s = ent.stripe;
  if (s && ["trialing", "active", "past_due"].includes(s.status) && s.until > iso) {
    if (s.status === "trialing") return { status: "trial", until: s.trial_end ?? s.until };
    if (s.status === "past_due") return { status: "past_due", until: s.until };
    return { status: s.cancel_at_period_end ? "canceling" : "active", until: s.until };
  }
  if (ent.beta_until && ent.beta_until > iso) return { status: "beta", until: ent.beta_until };
  return { status: "none", until: null };
}

/** entitlements/{uid}: escrito só pelo servidor (cobrança, cupom, beta). Ao vivo, para refletir a assinatura na hora. */
export function useEntitlements(userId: string) {
  const [ent, setEnt] = useState<Entitlements>(FREE);
  useEffect(
    () =>
      onSnapshot(
        entitlementsDoc(userId),
        (s) => setEnt(s.exists() ? { ...FREE, ...(s.data() as Partial<Entitlements>) } : FREE),
        () => {},
      ),
    [userId],
  );
  return ent;
}
