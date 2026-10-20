import { FieldValue, getFirestore } from "firebase-admin/firestore";

/** Conta uma chamada do dia (UTC) e devolve o total. Só o Admin SDK escreve em ai_usage. */
export async function bumpUsage(uid: string, field = "calls") {
  const db = getFirestore();
  const ref = db.doc(`ai_usage/${uid}_${new Date().toISOString().slice(0, 10)}`);
  return db.runTransaction(async (tx) => {
    const calls = ((await tx.get(ref)).get(field) as number | undefined ?? 0) + 1;
    tx.set(ref, { user_id: uid, [field]: calls, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    return calls;
  });
}
