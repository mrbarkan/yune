/** Links que abrem uma folha: `?registrar=lanche&de=<iso>&ate=<iso>` (lanche) e `?fechar=AAAA-MM-DD` (fechar o dia). */
export type DeepLink = { kind: "snack"; from: string; to: string } | { kind: "review"; day: string } | null;

const PARAMS = ["registrar", "de", "ate", "fechar"];
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

const isoTime = (v: string | null) => (v && ISO.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null);

// Data que existe no calendário (2026-02-30 não).
function realDay(v: string | null) {
  const m = v ? DAY.exec(v) : null;
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function parseDeepLink(search: string): DeepLink {
  const p = new URLSearchParams(search);
  const day = p.get("fechar");
  if (day !== null) return realDay(day) ? { kind: "review", day } : null;
  if (p.get("registrar") !== "lanche") return null;
  const from = p.get("de");
  const to = p.get("ate");
  const a = isoTime(from);
  const b = isoTime(to);
  return a !== null && b !== null && a < b ? { kind: "snack", from: from!, to: to! } : null;
}

/** URL sem os parâmetros do link (mantém os outros e o hash). */
export function withoutDeepLink(href: string): string {
  const u = new URL(href);
  for (const k of PARAMS) u.searchParams.delete(k);
  return u.pathname + u.search + u.hash;
}

/** `AAAA-MM-DD` → início desse dia no fuso do aparelho. */
export const dayFromId = (id: string) => {
  const [y, m, d] = id.split("-").map(Number);
  return new Date(y, m - 1, d);
};
