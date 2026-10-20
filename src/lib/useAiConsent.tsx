import { useCallback, useRef, useState } from "react";
import { updateDoc } from "firebase/firestore";
import { AiConsentSheet } from "@/sheets/AiConsentSheet";
import { AI_CONSENT_VERSION, hasAiConsent } from "./consent";
import { profileDoc, type Profile } from "./firebase";

// Último estado gravado nesta sessão, por pessoa. Vale enquanto o perfil (prop) ainda não foi recarregado,
// inclusive para folhas abertas depois do "Concordo".
const session = new Map<string, boolean>();

/** Consentimento efetivo: o que foi gravado nesta sessão tem prioridade sobre o perfil carregado. */
export const aiConsentOn = (p: Pick<Profile, "id" | "ai_consent">): boolean => session.get(p.id) ?? hasAiConsent(p);

export async function grantAiConsent(uid: string): Promise<void> {
  await updateDoc(profileDoc(uid), { ai_consent: { at: new Date().toISOString(), version: AI_CONSENT_VERSION } });
  session.set(uid, true);
}

export async function revokeAiConsent(uid: string): Promise<void> {
  await updateDoc(profileDoc(uid), { ai_consent: null });
  session.set(uid, false);
}

/** `ask(run)` executa `run` já, se há consentimento; senão abre a folha e executa depois do "Concordo". */
export function useAiConsent(profile: Pick<Profile, "id" | "ai_consent">, onGranted?: () => void): { ask: (run: () => void) => void; sheet: React.ReactNode } {
  const [pending, setPending] = useState<(() => void) | null>(null);
  const latest = useRef({ profile, onGranted });
  latest.current = { profile, onGranted };

  const ask = useCallback((run: () => void) => {
    if (aiConsentOn(latest.current.profile)) run();
    else setPending(() => run);
  }, []);

  const close = useCallback(() => setPending(null), []);
  const sheet = pending && (
    <AiConsentSheet onClose={close} onAgree={async () => {
      await grantAiConsent(latest.current.profile.id);
      setPending(null);
      pending();
      latest.current.onGranted?.();
    }} />
  );
  return { ask, sheet };
}
