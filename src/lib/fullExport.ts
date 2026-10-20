import { getDoc, getDocs } from "firebase/firestore";
import { getBlob, ref } from "firebase/storage";
import { zip, strToU8, type Zippable } from "fflate";
import { auth, entitlementsDoc, profileDoc, remindersDoc, rows, storage, table, type Table } from "./firebase";
import { localDay } from "./photos";

export type FullData = {
  profile: Record<string, unknown>;
  reminders: Record<string, unknown> | null;
  entitlements: Record<string, unknown> | null;
  collections: Partial<Record<Table, Record<string, unknown>[]>>;
};

/** Toda coleção, menos as inscrições de push (são do aparelho). Fotos do corpo só entram se a pessoa escolher. */
export const FULL_COLLECTIONS: Table[] = [
  "meals", "activities", "water", "sleep", "custom_foods", "diet_plans", "measurements", "body_comp", "lab_reports", "body_photos", "anamnesis",
];

const str = (v: unknown) => (typeof v === "string" ? v : null);

export function filePaths(d: FullData, uid: string, includeBody: boolean): string[] {
  const c = d.collections;
  const found: unknown[] = [d.profile.photo_path];
  for (const m of c.meals ?? []) found.push(m.photo_path);
  for (const b of c.body_comp ?? []) found.push(b.file_path);
  for (const l of c.lab_reports ?? []) if (Array.isArray(l.file_paths)) found.push(...l.file_paths);
  for (const p of c.diet_plans ?? []) found.push(p.file_path);
  if (includeBody) for (const b of c.body_photos ?? []) found.push(b.path);
  const ok = new RegExp(`^(meal-photos|profile-photos|body-photos|health-docs|diet-plans)/${uid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[^/]+$`);
  const set = new Set<string>();
  for (const v of found) {
    const s = str(v);
    if (s && ok.test(s) && !s.includes("..")) set.add(s);
  }
  return [...set].sort();
}

/** meal-photos/{uid}/a.jpg → arquivos/meal-photos/a.jpg */
export const zipName = (path: string) => {
  const [folder, , ...rest] = path.split("/");
  return `arquivos/${folder}/${rest.join("/")}`;
};

export function manifest(d: FullData, files: string[], missing: string[], now: Date): object {
  const { push_subscriptions: _drop, ...colecoes } = d.collections;
  void _drop;
  return {
    app: "Yune",
    formato: 1,
    exportado_em: now.toISOString(),
    perfil: d.profile,
    lembretes: d.reminders,
    assinatura: d.entitlements,
    colecoes,
    arquivos: files.map((p) => ({ caminho: zipName(p) })),
    arquivos_faltando: missing.map(zipName),
  };
}

export const LEIA_ME = `Yune - seus dados

Este arquivo .zip tem tudo o que você registrou no Yune.
- dados.json: todos os registros (perfil, refeições, água, sono, movimento, medidas, exames, questionário, dieta e lembretes).
- arquivos/: as fotos e os documentos originais que você enviou, do jeito que foram enviados.
- Fotos do corpo só vêm se você escolheu incluí-las ao baixar.
- Se algum arquivo não pôde ser baixado, ele aparece em arquivos_faltando dentro de dados.json.

Guarde este arquivo com cuidado: ele tem dados de saúde.
`;

export const zipFileName = (now: Date, tz: string) => `yune-meus-dados-${localDay(now.toISOString(), tz)}.zip`;

async function load(includeBody: boolean): Promise<{ uid: string; data: FullData }> {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login para continuar.");
  const cols = FULL_COLLECTIONS.filter((n) => includeBody || n !== "body_photos");
  const [p, r, e, lists] = await Promise.all([
    getDoc(profileDoc(u.uid)), getDoc(remindersDoc(u.uid)), getDoc(entitlementsDoc(u.uid)),
    Promise.all(cols.map(async (n) => [n, rows<Record<string, unknown>>(await getDocs(table(n)))] as const)),
  ]);
  return {
    uid: u.uid,
    data: {
      profile: { ...p.data(), id: u.uid },
      reminders: r.exists() ? (r.data() as Record<string, unknown>) : null,
      entitlements: e.exists() ? (e.data() as Record<string, unknown>) : null,
      collections: Object.fromEntries(lists),
    },
  };
}

const zipAsync = (z: Zippable) =>
  new Promise<Uint8Array>((res, rej) => zip(z, (err, out) => (err ? rej(err) : res(out))));

export async function downloadAll(o: {
  includeBody: boolean; tz: string; onProgress(done: number, total: number): void;
}): Promise<{ missing: number }> {
  const { uid, data } = await load(o.includeBody);
  const paths = filePaths(data, uid, o.includeBody);
  const got = new Map<string, Uint8Array>();
  const missing: string[] = [];
  let done = 0;
  o.onProgress(0, paths.length);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const p = paths[next++];
      try {
        got.set(p, new Uint8Array(await (await getBlob(ref(storage, p))).arrayBuffer()));
      } catch (e) {
        console.error("fullExport file", p, e);
        missing.push(p);
      }
      o.onProgress(++done, paths.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, paths.length) }, worker));
  missing.sort();

  const now = new Date();
  const z: Zippable = {
    "dados.json": [strToU8(JSON.stringify(manifest(data, [...got.keys()].sort(), missing, now), null, 2)), { level: 6 }],
    "LEIA-ME.txt": [strToU8(LEIA_ME), { level: 6 }],
  };
  for (const [p, bytes] of got) z[zipName(p)] = [bytes, { level: 0 }];
  const out = await zipAsync(z);

  const url = URL.createObjectURL(new Blob([out as BlobPart], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName(now, o.tz);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { missing: missing.length };
}
