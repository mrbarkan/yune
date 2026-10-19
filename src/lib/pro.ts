import { useEffect, useState } from "react";
import { getDoc } from "firebase/firestore";
import { entitlementsDoc, type Entitlements } from "./firebase";

// Beta: todo mundo tem Pro enquanto não houver cobrança. Desligar junto com PRO_OPEN em functions/src/pro.ts.
const PRO_OPEN = true;

/** Recursos e o plano que libera cada um. Novos recursos pagos entram aqui. */
export const FEATURES = { diet: "pro" } as const;
export type Feature = keyof typeof FEATURES;

const FREE: Entitlements = { pro: false, until: null };

export function canUse(ent: Entitlements, feature: Feature) {
  if (FEATURES[feature] !== "pro" || PRO_OPEN) return true;
  return ent.pro && (!ent.until || ent.until > new Date().toISOString());
}

/** entitlements/{uid}: escrito só pelo servidor (cobrança, cupom, beta). */
export function useEntitlements(userId: string) {
  const [ent, setEnt] = useState<Entitlements>(FREE);
  useEffect(() => {
    getDoc(entitlementsDoc(userId)).then((s) => s.exists() && setEnt({ ...FREE, ...(s.data() as Partial<Entitlements>) })).catch(() => {});
  }, [userId]);
  return ent;
}
