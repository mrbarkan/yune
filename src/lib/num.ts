/**
 * Lê número em pt-BR ("71,8", "1.412,5", "1.412") ou com ponto decimal ("0.36"), com unidade opcional depois
 * ("82 cm", "5 mg/dL"). Texto, "<5", "≥ 60", "1/80", "10 a 20", "3,5 x 10^6" ou "1,412.5" → null.
 */
export function parseDecimal(s: string): number | null {
  const m = /^([-+]?\d[\d.,]*)[\p{L}%µ\s/]*$/u.exec(s.trim());
  if (!m) return null;
  const t = m[1];
  if (/,.*\./.test(t)) return null; // "1,412.5": vírgula antes do ponto é ambíguo
  let n: string;
  if (t.includes(",")) n = t.replace(/\./g, "").replace(",", ".");
  else if (/^[-+]?\d{1,3}(\.\d{3})+$/.test(t)) n = t.replace(/\./g, "");
  else n = t;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}
