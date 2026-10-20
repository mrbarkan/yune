import { useCallback, useState } from "react";
import { LineChart } from "@/components/LineChart";
import type { LabReport, LabResult, Profile } from "@/lib/firebase";
import { openHealthFile } from "@/lib/bodycomp";
import { LAB_CATALOG, outOfRange } from "@/lib/labs";
import { analyteSeries, deleteLabReport, outOfRangeCount, reportHoma } from "@/lib/labreports";
import { LabSheet } from "@/sheets/LabSheet";

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
const OUT = "fora da referência do laboratório";

/** Referência como impressa: faixa numérica se houver, senão o texto do laudo. */
function refLabel(r: LabResult) {
  if (r.ref_low != null && r.ref_high != null) return `${num(r.ref_low)}–${num(r.ref_high)}`;
  if (r.ref_high != null) return `até ${num(r.ref_high)}`;
  if (r.ref_low != null) return `a partir de ${num(r.ref_low)}`;
  return r.ref_text;
}

export default function LabsView({ profile, list, loadErr, allowed, startAdding, onPro, onBack, onChanged }: {
  profile: Profile; list: LabReport[]; loadErr?: string; allowed: boolean; startAdding?: boolean;
  onPro: () => void; onBack: () => void; onChanged: () => void;
}) {
  const [sheet, setSheet] = useState<{ rec?: LabReport } | null>(startAdding && allowed ? {} : null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const close = useCallback(() => setSheet(null), []);

  const desc = [...list].sort((a, b) => b.collected_at.localeCompare(a.collected_at));
  const charts = LAB_CATALOG.filter((l) => l.chart)
    .map((l) => ({ def: l, series: analyteSeries(list, l.code) }))
    .filter((c) => c.series.length > 0);

  function add(rec?: LabReport) {
    if (!allowed) return onPro();
    setSheet({ rec });
  }

  async function open(path: string) {
    setErr("");
    try {
      await openHealthFile(path);
    } catch {
      setErr("Não foi possível abrir o arquivo.");
    }
  }

  async function remove(r: LabReport) {
    setErr("");
    try {
      await deleteLabReport(r);
      setConfirm(null);
    } catch {
      setErr("Não foi possível apagar.");
    }
    onChanged(); // atualiza em qualquer caso (parte dos arquivos pode ter ido)
  }

  return (
    <main className="screen settings">
      <header className="screen-head">
        <button className="link back" onClick={onBack}>‹ Perfil</button>
        <p className="eyebrow">{profile.name || "Você"}</p>
        <h1 className="day-title">Exames</h1>
      </header>

      <button className="btn primary" onClick={() => add()}>+ Enviar exame</button>
      {!allowed && <p className="note">Para enviar novos exames, assine o Pro. Seus registros continuam aqui.</p>}

      {charts.map(({ def, series }) => {
        const last = series[series.length - 1];
        return (
          <section className="group" key={def.code}>
            <h2 className="section-title">{def.name} <span className="note">{num(last.v)} {def.unit}</span></h2>
            <LineChart points={series} band={last.band.low != null || last.band.high != null ? last.band : undefined} unit={def.unit} color="var(--ink)" />
          </section>
        );
      })}

      <section className="group">
        <h2 className="section-title">Laudos</h2>
        {!list.length && !loadErr && <p className="empty">Envie um exame de sangue</p>}
        {(loadErr || err) && <p className="note err">{loadErr || err}</p>}
        <ul className="meas-list lab-reports">
          {desc.map((r) => {
            const out = outOfRangeCount(r);
            const homa = reportHoma(r);
            return (
              <li key={r.id}>
                <details className="lab-report">
                  <summary>
                    <b>{day(r.collected_at)}</b>
                    <small>
                      {[r.lab, `${r.results.length} exames`, r.ai && "lido por IA"].filter(Boolean).join(" · ")}
                    </small>
                    {out > 0 && <small className="lab-out">{out} {OUT}</small>}
                  </summary>
                  <ul className="lab-results">
                    {r.results.map((x, i) => {
                      const o = outOfRange(x) === true;
                      return (
                        <li key={i} className={o ? "out" : ""}>
                          <span>{x.name}</span>
                          <span>{x.value_text || (x.value != null ? num(x.value) : "—")} {x.unit}</span>
                          {refLabel(x) && <small>ref. {refLabel(x)}</small>}
                          {o && <small className="lab-out">{OUT}</small>}
                        </li>
                      );
                    })}
                    {homa != null && (
                      <li>
                        <span>HOMA-IR</span>
                        <span>{num(homa)}</span>
                        <small>calculado: glicemia × insulina ÷ 405</small>
                      </li>
                    )}
                  </ul>
                </details>
                {confirm === r.id ? (
                  <div className="meas-actions">
                    <button className="link" onClick={() => { setConfirm(null); setErr(""); }}>Manter</button>
                    <button className="link" onClick={() => remove(r)}>Apagar</button>
                  </div>
                ) : (
                  <div className="meas-actions">
                    {(r.file_paths ?? []).map((p, i, all) => (
                      <button key={p} className="link" onClick={() => open(p)}>{all.length > 1 ? `Arquivo ${i + 1}` : "Arquivo"}</button>
                    ))}
                    <button className="link" onClick={() => add(r)}>Editar</button>
                    <button className="link" onClick={() => setConfirm(r.id)}>Apagar</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {sheet && <LabSheet profile={profile} rec={sheet.rec} onClose={close} onSaved={() => { close(); onChanged(); }} />}
    </main>
  );
}
