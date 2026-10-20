// Laudos de exames e bioimpedância: schemas para o Claude, rascunhos, validação e permissão de salvar.
// Os tipos espelham BodyComp / LabReport de src/lib/firebase.ts (as funções não importam de src).
import { LAB_CODES } from "./labCodes.js";

export type BodyCompValues = {
  weight_kg: number | null; fat_pct: number | null; fat_kg: number | null; muscle_kg: number | null;
  lean_kg: number | null; visceral: number | null; bmr_kcal: number | null; water_l: number | null;
  ecw_tbw: number | null; phase_angle: number | null;
};
export type BodyComp = BodyCompValues & {
  id: string; measured_at: string; device: string; file_path: string | null; ai: boolean; created_at: string;
};
export type LabResult = {
  code: string; name: string; value: number | null; value_text: string; unit: string;
  ref_low: number | null; ref_high: number | null; ref_text: string;
};
export type LabReport = {
  id: string; collected_at: string; lab: string | null; results: LabResult[];
  file_paths: string[]; ai: boolean; created_at: string;
};

export type BodyCompDraft = Omit<BodyComp, "id" | "file_path" | "ai" | "created_at">;
export type LabsDraft = Omit<LabReport, "id" | "file_paths" | "ai" | "created_at">;

// Sem anyOf/null (ver importDietPlan): ausente = 0 na bioimpedância e "" nos exames.
const num = { type: "number" };
const str = { type: "string" };

export const BODY_COMP_FIELDS = [
  "weight_kg", "fat_pct", "fat_kg", "muscle_kg", "lean_kg", "visceral", "bmr_kcal", "water_l", "ecw_tbw", "phase_angle",
] as const;

export const BODY_COMP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["device", "measured_on", ...BODY_COMP_FIELDS],
  properties: { device: str, measured_on: str, ...Object.fromEntries(BODY_COMP_FIELDS.map((k) => [k, num])) },
};

export const LABS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["collected_on", "lab", "results"],
  properties: {
    collected_on: str,
    lab: str,
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "name", "value", "unit", "ref_low", "ref_high", "ref_text"],
        properties: { code: { type: "string", enum: [...LAB_CODES, "outro"] }, name: str, value: str, unit: str, ref_low: str, ref_high: str, ref_text: str },
      },
    },
  },
};

/** Cópia de parseDecimal (src/lib/num.ts): "1.412,5" → 1412.5, "82 cm" → 82; "<5", "≥ 60", "1/80", "10 a 20" ou "" → null. */
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

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const isoDate = (d: unknown) => {
  const s = text(d);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return "";
  const t = new Date(`${s}T12:00:00.000Z`);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString();
};

export function toBodyCompDraft(raw: Record<string, unknown>): BodyCompDraft {
  const n = (k: string) => {
    const v = raw[k];
    return typeof v === "number" && Number.isFinite(v) && v !== 0 ? v : null;
  };
  return {
    measured_at: isoDate(raw.measured_on),
    device: text(raw.device),
    weight_kg: n("weight_kg"), fat_pct: n("fat_pct"), fat_kg: n("fat_kg"), muscle_kg: n("muscle_kg"),
    lean_kg: n("lean_kg"), visceral: n("visceral"), bmr_kcal: n("bmr_kcal"), water_l: n("water_l"),
    ecw_tbw: n("ecw_tbw"), phase_angle: n("phase_angle"),
  };
}

export function toLabsDraft(raw: Record<string, unknown>): LabsDraft {
  const list = Array.isArray(raw.results) ? (raw.results as Record<string, unknown>[]) : [];
  return {
    collected_at: isoDate(raw.collected_on),
    lab: text(raw.lab) || null,
    results: list.map((r) => {
      const printed = text(r.value);
      return {
        code: text(r.code) || "outro",
        name: text(r.name),
        value: parseDecimal(printed),
        value_text: printed,
        unit: text(r.unit),
        ref_low: parseDecimal(text(r.ref_low)),
        ref_high: parseDecimal(text(r.ref_high)),
        ref_text: text(r.ref_text),
      };
    }),
  };
}

const RANGES: Record<keyof BodyCompValues, [number, number, string]> = {
  weight_kg: [20, 400, "Peso"], fat_pct: [2, 75, "Gordura (%)"], fat_kg: [1, 200, "Massa de gordura"],
  muscle_kg: [1, 200, "Massa muscular"], lean_kg: [1, 200, "Massa magra"], visceral: [1, 60, "Gordura visceral"],
  bmr_kcal: [500, 5000, "Metabolismo basal"], water_l: [5, 100, "Água corporal"], ecw_tbw: [0.2, 0.6, "ECW/TBW"],
  phase_angle: [1, 20, "Ângulo de fase"],
};

const MAX_STR = 120;
const MAX_RESULTS = 80;

function dateError(v: unknown, label: string): string | null {
  const s = typeof v === "string" ? v : "";
  const t = Date.parse(s);
  if (!s || Number.isNaN(t)) return `Informe a data ${label}.`;
  if (t > Date.now() + 24 * 3600 * 1000) return "A data não pode ser no futuro.";
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function validateBodyComp(v: unknown): string | null {
  if (!isObj(v)) return "Dados inválidos.";
  const d = dateError(v.measured_at, "da medição");
  if (d) return d;
  if (typeof v.device !== "string" || !v.device.trim()) return "Informe o aparelho.";
  if (v.device.length > MAX_STR) return "Nome do aparelho longo demais.";
  for (const k of BODY_COMP_FIELDS) {
    const x = v[k];
    if (x == null) continue;
    const [min, max, label] = RANGES[k];
    if (typeof x !== "number" || !Number.isFinite(x) || x < min || x > max) return `${label} fora do intervalo (${min} a ${max}).`;
  }
  return null;
}

export function validateLabReport(v: unknown): string | null {
  if (!isObj(v)) return "Dados inválidos.";
  const d = dateError(v.collected_at, "da coleta");
  if (d) return d;
  if (v.lab != null && (typeof v.lab !== "string" || v.lab.length > MAX_STR)) return "Nome do laboratório inválido.";
  if (!Array.isArray(v.results) || v.results.length === 0) return "Inclua ao menos um resultado.";
  if (v.results.length > MAX_RESULTS) return `No máximo ${MAX_RESULTS} resultados por laudo.`;
  const codes: readonly string[] = [...LAB_CODES, "outro"];
  for (const r of v.results as unknown[]) {
    if (!isObj(r)) return "Resultado inválido.";
    if (typeof r.code !== "string" || !codes.includes(r.code)) return "Exame desconhecido.";
    for (const k of ["name", "value_text", "unit", "ref_text"]) {
      if (typeof r[k] !== "string") return "Resultado inválido.";
      if ((r[k] as string).length > MAX_STR) return "Texto longo demais em um resultado.";
    }
    if (!(r.name as string).trim()) return "Todo resultado precisa de nome.";
    for (const k of ["value", "ref_low", "ref_high"]) {
      if (r[k] != null && (typeof r[k] !== "number" || !Number.isFinite(r[k]))) return "Valor numérico inválido.";
    }
  }
  return null;
}

export function canSave(isProUser: boolean): string | null {
  return isProUser ? null : "Exames e composição corporal são recursos Pro.";
}

/** Só os campos conhecidos, para não gravar lixo vindo do app. */
export function cleanBodyComp(v: Record<string, unknown>): BodyCompDraft {
  const out = { measured_at: new Date(v.measured_at as string).toISOString(), device: (v.device as string).trim() } as BodyCompDraft;
  for (const k of BODY_COMP_FIELDS) out[k] = typeof v[k] === "number" ? (v[k] as number) : null;
  return out;
}

export function cleanLabReport(v: Record<string, unknown>): LabsDraft {
  const n = (x: unknown) => (typeof x === "number" ? x : null);
  return {
    collected_at: new Date(v.collected_at as string).toISOString(),
    lab: typeof v.lab === "string" && v.lab.trim() ? v.lab.trim() : null,
    results: (v.results as Record<string, unknown>[]).map((r) => ({
      code: r.code as string, name: (r.name as string).trim(), value: n(r.value), value_text: r.value_text as string,
      unit: r.unit as string, ref_low: n(r.ref_low), ref_high: n(r.ref_high), ref_text: r.ref_text as string,
    })),
  };
}
