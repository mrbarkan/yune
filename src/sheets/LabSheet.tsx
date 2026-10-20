import { useCallback, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { readHealthDoc, saveHealthDoc, type LabReport, type LabResult, type LabsDraft, type Profile } from "@/lib/firebase";
import { deleteHealthFile, uploadHealthFile } from "@/lib/bodycomp";
import { collectedAtFor } from "@/lib/labreports";
import { LAB_CATALOG } from "@/lib/labs";
import { parseDecimal } from "@/lib/num";
import { localDay } from "@/lib/photos";
import { markAiConsentRequired, useAiConsent } from "@/lib/useAiConsent";

const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const dayOf = (iso: string | undefined, tz: string) => {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return localDay(iso, tz);
};

/** Linha em edição: números ficam como texto digitado. */
type Row = { key: number; code: string; name: string; value: string; unit: string; low: string; high: string; refText: string };
let seq = 0;
const blank = (): Row => ({ key: ++seq, code: "outro", name: "", value: "", unit: "", low: "", high: "", refText: "" });
const toRow = (r: LabResult): Row => ({
  key: ++seq, code: r.code, name: r.name, value: r.value_text || show(r.value), unit: r.unit,
  low: show(r.ref_low), high: show(r.ref_high), refText: r.ref_text,
});

/** Linha → resultado. Com `<` ou `>` (ou texto ilegível) o valor numérico é null: nunca vira gráfico nem contagem. */
export function rowToResult(r: Row): LabResult | { error: string } {
  const def = LAB_CATALOG.find((l) => l.code === r.code);
  const name = r.name.trim() || def?.name || "";
  if (!name) return { error: "Informe o nome de cada exame." };
  const text = r.value.trim();
  if (!text) return { error: `${name}: informe o valor.` };
  const bound = (s: string, label: string): { v: number | null; error?: string } => {
    const t = s.trim();
    if (!t) return { v: null };
    const n = parseDecimal(t);
    return n == null ? { v: null, error: `${name}: confira a referência (${label}).` } : { v: n };
  };
  const lo = bound(r.low, "mínimo"), hi = bound(r.high, "máximo");
  if (lo.error || hi.error) return { error: (lo.error || hi.error)! };
  return {
    code: def ? r.code : "outro", name, value: parseDecimal(text), value_text: text, unit: r.unit.trim(),
    ref_low: lo.v, ref_high: hi.v, ref_text: r.refText,
  };
}

type Stage = "pick" | "reading" | "form";

/** Envio do exame (PDF ou até 6 fotos) → "Confira os valores" → salvar. `rec` = edição de um laudo. */
export function LabSheet({ profile, rec, onClose, onSaved }: {
  profile: Profile; rec?: LabReport; onClose: () => void; onSaved: () => void;
}) {
  const tz = profile.timezone;
  const [stage, setStage] = useState<Stage>(rec ? "form" : "pick");
  const [lab, setLab] = useState(rec?.lab ?? "");
  const [date, setDate] = useState(rec ? dayOf(rec.collected_at, tz) : "");
  const [rows, setRows] = useState<Row[]>(() => (rec ? rec.results.map(toRow) : [blank()]));
  const [ai, setAi] = useState(rec?.ai ?? false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Arquivos enviados nesta sessão e ainda não salvos (apagados se a pessoa desistir).
  const pending = useRef<string[]>([]);
  const cancelled = useRef(false);

  const dropPending = useCallback(() => {
    for (const p of pending.current) deleteHealthFile(p).catch(() => {});
    pending.current = [];
  }, []);

  const cancel = useCallback(() => {
    if (saving) return;
    cancelled.current = true;
    dropPending();
    onClose();
  }, [saving, onClose, dropPending]);

  const consent = useAiConsent(profile);

  // Confere os arquivos antes de pedir consentimento; só então envia.
  function pickFiles(files: File[]) {
    if (!files.length) return;
    setMsg("");
    const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    if (files.some(isPdf) && files.length > 1) return setMsg("Envie um PDF sozinho, ou até 6 fotos.");
    if (files.length > 6) return setMsg("Envie no máximo 6 fotos.");
    consent.ask(() => onFiles(files));
  }

  async function onFiles(files: File[]) {
    setStage("reading");
    const up: string[] = [];
    let again = false;
    try {
      for (const f of files) {
        up.push(await uploadHealthFile(f));
        if (cancelled.current) throw new Error("");
      }
      pending.current = up;
      const res = await readHealthDoc<LabsDraft>({ mode: "labs", paths: up });
      if (cancelled.current) throw new Error("");
      if (res.consent === "required") {
        again = true;
        throw new Error("");
      }
      if (res.error || !res.draft) throw new Error(res.error || "Não foi possível ler o documento agora.");
      const d = res.draft;
      setLab(d.lab ?? "");
      setDate(dayOf(d.collected_at, tz));
      setRows(d.results.length ? d.results.map(toRow) : [blank()]);
      setAi(true);
      setStage("form");
    } catch (e) {
      await Promise.all(up.map((p) => deleteHealthFile(p).catch(() => {})));
      pending.current = [];
      if (cancelled.current) return;
      setStage("pick");
      if (again) {
        markAiConsentRequired(profile.id);
        return consent.ask(() => onFiles(files));
      }
      setMsg((e as Error).message || "Não foi possível enviar.");
    }
  }

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const pickCode = (r: Row, code: string) => {
    const def = LAB_CATALOG.find((l) => l.code === code);
    patch(r.key, { code, ...(def ? { name: def.name, unit: r.unit || def.unit } : {}) });
  };

  async function save() {
    if (!date) return setMsg("Informe a data da coleta.");
    let collectedAt = rec?.collected_at ?? "";
    if (!(rec && dayOf(rec.collected_at, tz) === date)) {
      const c = collectedAtFor(date, tz);
      if ("error" in c) return setMsg(c.error);
      collectedAt = c.iso;
    }
    const used = rows.filter((r) => r.name.trim() || r.value.trim() || r.unit.trim() || r.low.trim() || r.high.trim());
    if (!used.length) return setMsg("Inclua ao menos um exame.");
    if (used.length > 80) return setMsg("No máximo 80 exames por laudo.");
    const results: LabResult[] = [];
    for (const r of used) {
      const x = rowToResult(r);
      if ("error" in x) return setMsg(x.error);
      results.push(x);
    }
    setSaving(true);
    setMsg("");
    // Na edição o servidor troca arquivos e `ai` pelo que vier: reenvia os atuais.
    const paths = rec ? rec.file_paths ?? [] : pending.current;
    const res = await saveHealthDoc({
      mode: "labs", id: rec?.id, paths, ai,
      data: { collected_at: collectedAt, lab: lab.trim() || null, results },
    });
    if (res.error) {
      setMsg(res.error);
      setSaving(false);
      return;
    }
    pending.current = [];
    onSaved();
  }

  return (
    <Sheet title="Exames de sangue" onClose={cancel}>
      {stage === "pick" && (
        <>
          <p className="note">Envie o laudo do laboratório (PDF ou até 6 fotos). O Yune lê os valores e você confere antes de salvar.</p>
          <input ref={input} type="file" hidden multiple accept="application/pdf,image/*"
            onChange={(e) => { const fs = Array.from(e.target.files ?? []); pickFiles(fs); e.target.value = ""; }} />
          <button className="btn primary" onClick={() => input.current?.click()}>Enviar laudo</button>
          <button className="btn ghost" onClick={() => { setMsg(""); setStage("form"); }}>Digitar valores</button>
          {msg && <p className="note err">{msg}</p>}
        </>
      )}
      {stage === "reading" && <p className="thinking"><span className="pulse">Lendo o laudo…</span></p>}
      {stage === "form" && (
        <>
          <h3 className="confirm-title">{ai ? "Confira os valores" : rec ? "Editar exames" : "Valores"}</h3>
          {ai && <p className="note">Lidos do laudo que você enviou. Corrija o que estiver diferente.</p>}
          {ai && <span className="chip chip-static">estimado por IA, confira</span>}
          <div className="row">
            <label className="field"><span>Laboratório</span>
              <input value={lab} maxLength={120} placeholder="opcional" onChange={(e) => setLab(e.target.value)} /></label>
            <label className="field"><span>Data da coleta</span>
              <input type="date" max={dayOf(new Date().toISOString(), tz)} value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <ul className="lab-rows">
            {rows.map((r) => (
              <li key={r.key} className="lab-row">
                <div className="lab-line">
                  <select aria-label="Exame" value={LAB_CATALOG.some((l) => l.code === r.code) ? r.code : "outro"}
                    onChange={(e) => pickCode(r, e.target.value)}>
                    {LAB_CATALOG.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                    <option value="outro">Outro</option>
                  </select>
                  <button className="link" aria-label="Remover exame" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>Remover</button>
                </div>
                <input aria-label="Nome" maxLength={120} placeholder="Nome do exame" value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} />
                <div className="lab-line">
                  <input aria-label="Valor" maxLength={120} inputMode="decimal" placeholder="valor" value={r.value} onChange={(e) => patch(r.key, { value: e.target.value })} />
                  <input aria-label="Unidade" maxLength={120} placeholder="unidade" value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} />
                </div>
                <div className="lab-line">
                  <input aria-label="Referência mínima" inputMode="decimal" placeholder="ref. mín." value={r.low} onChange={(e) => patch(r.key, { low: e.target.value })} />
                  <input aria-label="Referência máxima" inputMode="decimal" placeholder="ref. máx." value={r.high} onChange={(e) => patch(r.key, { high: e.target.value })} />
                </div>
                {r.refText && <small className="note small">Referência no laudo: {r.refText}</small>}
              </li>
            ))}
          </ul>
          <button className="btn ghost" onClick={() => setRows((rs) => [...rs, blank()])}>+ Adicionar exame</button>
          {msg && <p className="note err">{msg}</p>}
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar"}</button>
        </>
      )}
      {consent.sheet}
    </Sheet>
  );
}
