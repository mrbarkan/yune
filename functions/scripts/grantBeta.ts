// Dá Pro de beta a todos: npm --prefix functions run grant-beta -- --days 30 [--apply] [--project <id>]
// Sem --apply é só simulação (dry-run); --dry-run força a simulação mesmo com --apply.
// Sem emulador, --project é obrigatório. Grava em entitlements/{uid}.beta_until e recalcula pro/until/source.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { parseArgs, runGrant, type GrantStore, type Stored } from "../src/betaGrant.js";

let args;
try {
  args = parseArgs(process.argv.slice(2), process.env);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: args.project });
const db = getFirestore();

const store: GrantStore = {
  uids: async () => (await db.collection("users").select().get()).docs.map((d) => d.id),
  read: async (uid) => (await db.doc(`entitlements/${uid}`).get()).data() as Stored | undefined,
  update: (uid, decide) =>
    db.runTransaction(async (tx) => {
      const ref = db.doc(`entitlements/${uid}`);
      const d = decide((await tx.get(ref)).data() as Stored | undefined);
      if (d.write) tx.set(ref, d.data, { merge: true }); // merge: o campo stripe fica como está
      return d.write;
    }),
};

const where = process.env.FIRESTORE_EMULATOR_HOST ? `emulador ${process.env.FIRESTORE_EMULATOR_HOST}` : `projeto ${args.project}`;
console.log(`${args.dryRun ? "[dry-run] " : ""}Beta de ${args.days} dias em ${where}${args.dryRun ? " — use --apply para gravar" : ""}`);
const c = await runGrant(store, args, new Date());
console.log(`${c.total} pessoas: ${c.granted} ${args.dryRun ? "receberiam" : "receberam"} beta, ${c.skipped} puladas (beta mais longo).`);
