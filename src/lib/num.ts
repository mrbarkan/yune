/** Lê número em pt-BR ("71,8", "1.412,5", "1.412") ou com ponto decimal ("0.36"). Texto ou "<5" → null. */
export function parseDecimal(s: string): number | null {
  if (/[<>]/.test(s)) return null;
  const t = s.replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  let n: string;
  if (t.includes(",")) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, "");
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
