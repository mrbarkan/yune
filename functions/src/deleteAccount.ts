// Apagar a conta e todos os dados (direito de eliminação). Ordem: cliente na Stripe (cancela as assinaturas na hora),
// trava deleting/{uid} (as regras passam a recusar escritas de tokens antigos; fica para sempre), arquivos, documentos, usuário do Auth. Se a Stripe falhar nada é apagado, e a pessoa pode tentar de novo.
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import Stripe from "stripe";
import { mockBillingEnabled } from "./mockBilling.js";
import { REGION } from "./region.js";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

export const STORAGE_PREFIXES = ["meal-photos", "profile-photos", "body-photos", "health-docs", "diet-plans"] as const;
export const REAUTH_SECONDS = 600;

type CheckAuth = { uid: string; token: { auth_time?: number } };

export function checkDeleteRequest(auth: CheckAuth | undefined, data: unknown, nowSec: number): { error: string; reauth?: true } | null {
  if (!auth) return { error: "Faça login para continuar." };
  if ((data as { confirm?: unknown } | null | undefined)?.confirm !== "APAGAR") return { error: "Digite APAGAR para confirmar." };
  const at = auth.token.auth_time;
  if (typeof at !== "number" || nowSec - at > REAUTH_SECONDS) return { error: "Por segurança, confirme seu acesso de novo.", reauth: true };
  return null;
}

export type DeleteDeps = {
  customerId(uid: string): Promise<string | null>;
  deleteCustomer(id: string): Promise<void>;
  lock(uid: string): Promise<void>;
  deleteFiles(prefix: string): Promise<void>;
  deleteDocs(uid: string): Promise<void>;
  deleteUser(uid: string): Promise<void>;
};

export async function deleteAccountStep(uid: string, deps: DeleteDeps): Promise<void> {
  const customer = await deps.customerId(uid);
  if (customer) await deps.deleteCustomer(customer);
  await deps.lock(uid);
  for (const prefix of STORAGE_PREFIXES) await deps.deleteFiles(`${prefix}/${uid}/`);
  await deps.deleteDocs(uid);
  await deps.deleteUser(uid);
}

const code = (err: unknown) => (err as { code?: unknown } | null)?.code;

/** Roda `fn` e ignora só o erro com esse `code` (recurso que já não existe); qualquer outro continua. */
export async function ignoring(errCode: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (code(err) !== errCode) throw err;
  }
}

function realDeps(): DeleteDeps {
  const db = getFirestore();
  return {
    customerId: async (uid) => ((await db.doc(`billing/${uid}`).get()).get("customer_id") as string | undefined) ?? null,
    deleteCustomer: async (id) => {
      if (mockBillingEnabled()) return;
      await ignoring("resource_missing", () => new Stripe(STRIPE_SECRET_KEY.value()).customers.del(id));
    },
    lock: async (uid) => { await db.doc(`deleting/${uid}`).set({ at: new Date().toISOString() }); },
    deleteFiles: async (prefix) => { await getStorage().bucket().deleteFiles({ prefix }); },
    deleteDocs: async (uid) => {
      await db.recursiveDelete(db.doc(`users/${uid}`));
      await db.doc(`reminders/${uid}`).delete();
      await db.doc(`entitlements/${uid}`).delete();
      await db.doc(`billing/${uid}`).delete();
      const usage = await db.collection("ai_usage").where("user_id", "==", uid).get();
      await Promise.all(usage.docs.map((d) => d.ref.delete()));
    },
    deleteUser: async (uid) => {
      await ignoring("auth/user-not-found", () => getAuth().deleteUser(uid));
    },
  };
}

export const deleteAccount = onCall({ region: REGION, secrets: [STRIPE_SECRET_KEY], timeoutSeconds: 300 }, async (req) => {
  const bad = checkDeleteRequest(req.auth, req.data, Math.floor(Date.now() / 1000));
  if (bad) return bad;
  const uid = req.auth!.uid;
  try {
    await deleteAccountStep(uid, realDeps());
    return { ok: true };
  } catch (err) {
    console.error("deleteAccount", uid, (err as Error | undefined)?.name, code(err));
    return { error: "Não foi possível apagar agora. Parte dos dados pode já ter sido apagada; tente de novo para concluir." };
  }
});
