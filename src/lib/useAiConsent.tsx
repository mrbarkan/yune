import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { updateDoc } from "firebase/firestore";
import { AiConsentSheet } from "@/sheets/AiConsentSheet";
import { AI_CONSENT_VERSION, grantAndRun, hasAiConsent } from "./consent";
import { profileDoc, type Profile } from "./firebase";

// Último estado conhecido nesta sessão, por pessoa. Vale enquanto o perfil (prop) ainda não foi recarregado,
// inclusive para folhas abertas depois do "Concordo", e cede ao servidor (consent: "required").
const session = new Map<string, boolean>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const set = (uid: string, v: boolean) => {
  session.set(uid, v);
  emit();
};

/** Consentimento efetivo: o que se sabe desta sessão tem prioridade sobre o perfil carregado. */
export const aiConsentOn = (p: Pick<Profile, "id" | "ai_consent">): boolean => session.get(p.id) ?? hasAiConsent(p);

/** Como `aiConsentOn`, mas re-renderiza quando o estado da sessão muda. */
export function useAiConsentOn(p: Pick<Profile, "id" | "ai_consent">): boolean {
  return useSyncExternalStore(subscribe, () => aiConsentOn(p));
}

export async function grantAiConsent(uid: string): Promise<void> {
  await updateDoc(profileDoc(uid), { ai_consent: { at: new Date().toISOString(), version: AI_CONSENT_VERSION } });
  set(uid, true);
}

export async function revokeAiConsent(uid: string): Promise<void> {
  await updateDoc(profileDoc(uid), { ai_consent: null });
  set(uid, false);
}

/** O servidor recusou por falta de consentimento (ex.: revogado em outro aparelho). */
export function markAiConsentRequired(uid: string): void {
  set(uid, false);
}

/** Ao sair da conta. */
export function resetAiConsentSession(): void {
  session.clear();
  emit();
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
  const sheet = pending && createPortal(
    <AiConsentSheet onClose={close} onAgree={async () => {
      await grantAndRun(() => grantAiConsent(latest.current.profile.id), pending, latest.current.onGranted);
      setPending(null);
    }} />,
    document.body,
  );
  return { ask, sheet };
}
