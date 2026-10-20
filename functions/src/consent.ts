// Consentimento para a IA (transferência de dados de saúde para a Anthropic). Gravado pelo app em users/{uid}.ai_consent.
// A versão é igual a src/lib/consent.ts (teste de paridade).
import { getFirestore } from "firebase-admin/firestore";

export const AI_CONSENT_VERSION = 1;
export const AI_CONSENT_ERROR = "Para usar a IA, autorize em Ajustes › Leitura por IA.";

export function hasAiConsent(user: unknown): boolean {
  const c = (user as { ai_consent?: { at?: unknown; version?: unknown } | null } | null | undefined)?.ai_consent;
  return !!c && typeof c.at === "string" && typeof c.version === "number" && c.version >= AI_CONSENT_VERSION;
}

export async function checkAiConsent(uid: string): Promise<boolean> {
  return hasAiConsent((await getFirestore().doc(`users/${uid}`).get()).data());
}
