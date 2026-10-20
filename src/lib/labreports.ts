import { useEffect, useState } from "react";
import { deleteDoc, getDocs, orderBy, query } from "firebase/firestore";
import { row, rows, table, type LabReport, type LabResult } from "./firebase";
import { deleteHealthFile } from "./bodycomp";
import { localDay } from "./photos";
import { homaIr } from "./health";
import { normalizeResult, outOfRange } from "./labs";

export function useLabReports(version: number) {
  const [list, setList] = useState<LabReport[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    getDocs(query(table("lab_reports"), orderBy("collected_at")))
      .then((snap) => {
        if (!alive) return;
        setList(rows<LabReport>(snap));
        setErr("");
      })
      .catch(() => alive && setErr("Não foi possível carregar os exames."));
    return () => {
      alive = false;
    };
  }, [version]);
  return { list, err };
}

/** Apaga os arquivos (um a um) e depois o registro; se um arquivo falhar, o registro fica. */
export async function deleteLabReport(r: LabReport) {
  for (const p of r.file_paths ?? []) await deleteHealthFile(p);
  await deleteDoc(row("lab_reports", r.id));
}

/** Série de um exame na unidade canônica; a faixa do laudo é convertida com o mesmo fator. Valores não numéricos são ignorados. */
export function analyteSeries(reports: LabReport[], code: string) {
  const out: { t: string; v: number; band: { low: number | null; high: number | null } }[] = [];
  for (const rep of reports) {
    const r = rep.results.find((x) => x.code === code && normalizeResult(x));
    const n = r && normalizeResult(r);
    if (!r || !n) continue;
    const conv = (v: number | null) => (v == null ? null : normalizeResult({ ...r, value: v })?.value ?? null);
    out.push({ t: rep.collected_at, v: n.value, band: { low: conv(r.ref_low), high: conv(r.ref_high) } });
  }
  return out.sort((a, b) => a.t.localeCompare(b.t));
}

/** Quantos resultados estão fora da faixa do próprio laudo. */
export const outOfRangeCount = (r: LabReport) => r.results.filter((x) => outOfRange(x) === true).length;

/** HOMA-IR do laudo (calculado, não guardado): glicemia em mg/dL e insulina em µUI/mL normalizadas. */
export function reportHoma(r: LabReport): number | null {
  const pick = (code: string) => {
    const x = r.results.find((y: LabResult) => y.code === code && normalizeResult(y));
    return x ? normalizeResult(x)!.value : null;
  };
  return homaIr(pick("glicemia"), pick("insulina"));
}

/** Dia escolhido (AAAA-MM-DD) → ISO da coleta. Meio-dia local, mas nunca depois de agora (hoje de manhã vale); dia futuro → erro. */
export function collectedAtFor(date: string, tz: string, now = new Date()): { iso: string } | { error: string } {
  if (date > localDay(now.toISOString(), tz)) return { error: "A data da coleta não pode ser no futuro." };
  const noon = new Date(`${date}T12:00:00`);
  return { iso: (noon > now ? now : noon).toISOString() };
}
