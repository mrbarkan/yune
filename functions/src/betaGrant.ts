// Lógica do script grant-beta (scripts/grantBeta.ts): argumentos e decisão por pessoa, sem tocar no Firestore.
import { deriveEntitlement, type StripeState } from "./entitlement.js";

export type Stored = { beta_until?: string | null; stripe?: StripeState | null };
export type Args = { days: number; dryRun: boolean; project: string };
export type Decision =
  | { write: false }
  | { write: true; data: { beta_until: string; pro: boolean; until: string | null; source: "stripe" | "beta" | null } };

/** Sem emulador, --project é obrigatório (para não acertar a produção sem querer). */
export function parseArgs(argv: string[], env: Record<string, string | undefined>): Args {
  let days = NaN, dryRun = false, project = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--days") days = Number(argv[++i]);
    else if (a === "--project") project = argv[++i] ?? "";
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (!Number.isInteger(days) || days <= 0) throw new Error("Informe --days com um número inteiro positivo.");
  if (!env.FIRESTORE_EMULATOR_HOST) {
    if (!project) throw new Error("Sem emulador, informe --project <id> explicitamente.");
  } else if (!project) project = "demo-yune";
  return { days, dryRun, project };
}

/** Pula quem já tem beta_until mais tarde; senão grava o novo e recalcula pro/until/source mantendo o stripe guardado. */
export function decideGrant(stored: Stored | undefined, days: number, now: Date): Decision {
  const beta_until = new Date(now.getTime() + days * 86_400_000).toISOString();
  if (stored?.beta_until && stored.beta_until > beta_until) return { write: false };
  const ent = deriveEntitlement({ beta_until, stripe: stored?.stripe ?? null }, now);
  return { write: true, data: { beta_until, ...ent } };
}

export type GrantStore = {
  uids(): Promise<string[]>;
  read(uid: string): Promise<Stored | undefined>;
  /** Transação: lê o guardado, chama decide e grava só se write for true. Devolve se gravou. */
  update(uid: string, decide: (stored: Stored | undefined) => Decision): Promise<boolean>;
};

/** Percorre todos; em --dry-run só conta (nunca chama update). */
export async function runGrant(store: GrantStore, args: Pick<Args, "days" | "dryRun">, now: Date) {
  const counts = { total: 0, granted: 0, skipped: 0 };
  for (const uid of await store.uids()) {
    counts.total++;
    const decide = (s: Stored | undefined) => decideGrant(s, args.days, now);
    const wrote = args.dryRun ? decide(await store.read(uid)).write : await store.update(uid, decide);
    counts[wrote ? "granted" : "skipped"]++;
  }
  return counts;
}
