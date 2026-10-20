import raw from "@/data/labs.json";
import type { LabResult } from "./firebase";

export type LabDef = { code: string; name: string; unit: string; chart: boolean; conversions: Record<string, number> };

export const LAB_CATALOG: LabDef[] = raw as LabDef[];

/** Chave de comparação de unidade: minúsculas, sem espaços, prefixo µ/μ/u/mc unificado em µ. */
export const unitKey = (u: string) =>
  u.toLowerCase().replace(/\s+/g, "").replace(/^μ/, "µ").replace(/^mc/, "µ").replace(/^u(?!\/|i\/)/, "µ");

/** Converte o resultado para a unidade canônica do exame; sem valor, exame ou unidade conhecida → null. */
export function normalizeResult(r: LabResult): { value: number; unit: string } | null {
  const def = LAB_CATALOG.find((l) => l.code === r.code);
  if (!def || r.value == null) return null;
  const k = unitKey(r.unit);
  if (k === unitKey(def.unit)) return { value: r.value, unit: def.unit };
  for (const [u, f] of Object.entries(def.conversions)) {
    if (unitKey(u) === k) return { value: r.value * f, unit: def.unit };
  }
  return null;
}

/** Fora da faixa de referência do próprio laudo (valor e faixa brutos); sem valor ou faixa → null. */
export function outOfRange(r: LabResult): boolean | null {
  if (r.value == null || (r.ref_low == null && r.ref_high == null)) return null;
  return (r.ref_low != null && r.value < r.ref_low) || (r.ref_high != null && r.value > r.ref_high);
}
