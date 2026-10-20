// Recursos Pro. entitlements/{uid} = { pro: true, until: ISO | null, source } — só o servidor escreve (regras bloqueiam o app).
import { getFirestore } from "firebase-admin/firestore";

// Beta: todo mundo tem Pro enquanto não houver cobrança. Desligar junto com PRO_OPEN em src/lib/pro.ts.
const PRO_OPEN = true;

export async function isPro(uid: string) {
  if (PRO_OPEN) return true;
  const snap = await getFirestore().doc(`entitlements/${uid}`).get();
  const until = snap.get("until") as string | null | undefined;
  return snap.get("pro") === true && (!until || until > new Date().toISOString());
}
