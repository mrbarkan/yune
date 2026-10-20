// Lógica do script grant-beta (scripts/grantBeta.ts): argumentos e decisão por pessoa, sem tocar no Firestore.
import { deriveEntitlement, type StripeState } from "./entitlement.js";

export type Stored = { beta_until?: string | null; stripe?: StripeState | null };
export type Args = { days: number; dryRun: boolean; project: string };
export type Decision =
  | { write: false }
  | { write: true; data: { beta_until: string; pro: boolean; until: string | null; source: "stripe" | "beta" | null } };

/** Sem --apply é simulação (dry-run). Sem emulador, --project é obrigatório (para não acertar a produção sem querer). */
export function parseArgs(argv: string[], env: Record<string, string | undefined>): Args {
  let days = NaN, apply = false, forceDry = false, project = "";
  const value = (flag: string, i: number) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`Informe um valor para ${flag}.`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") apply = true;
    else if (a === "--dry-run") forceDry = true;
    else if (a === "--days") days = Number(value(a, i++));
    else if (a === "--project") project = value(a, i++);
    else throw new Error(`Argumento desconhecido: ${a}`);
  }
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("Use --days entre 1 e 90.");
  const dryRun = forceDry || !apply;
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
