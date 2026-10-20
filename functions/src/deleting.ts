// Trava de exclusão: deleteAccount grava deleting/{uid} e as regras recusam escritas do app. As Cloud Functions usam o
// Admin SDK (as regras não valem), então cada callable que grava dados da pessoa confere a trava logo depois do login.
// Sobra uma corrida mínima (chamada que passou da conferência um instante antes da trava); é aceita.
import { getFirestore } from "firebase-admin/firestore";

export const DELETING_ERROR = "Esta conta está sendo apagada.";

type DocReader = { doc(path: string): { get(): Promise<{ get(field: string): unknown }> } };

export async function isDeleting(uid: string, db: DocReader = getFirestore()): Promise<boolean> {
  return typeof (await db.doc(`deleting/${uid}`).get()).get("at") === "string";
}
