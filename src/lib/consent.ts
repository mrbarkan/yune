// Consentimento para a IA. Puro (sem Firebase); gravar/revogar fica em useAiConsent.tsx.
// A versão é igual a functions/src/consent.ts (teste de paridade).
import type { Profile } from "./firebase";

export const AI_CONSENT_VERSION = 1;

export function hasAiConsent(p: Pick<Profile, "ai_consent">): boolean {
  const c = p.ai_consent;
  return !!c && typeof c.at === "string" && c.version >= AI_CONSENT_VERSION;
}
