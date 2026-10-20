import { useCallback, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { readHealthDoc, saveHealthDoc, type BodyComp, type BodyCompDraft, type BodyCompValues, type Measurement, type Profile } from "@/lib/firebase";
import { deleteHealthFile, FIELDS, parseValues, uploadHealthFile } from "@/lib/bodycomp";
import { saveMeasurement } from "@/lib/measurements";
import { localDay } from "@/lib/photos";

const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));
const dayOf = (iso: string | undefined, tz: string) => {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return localDay(iso, tz);
};

type Stage = "pick" | "reading" | "form";

/** Envio do laudo (ou digitação) → "Confira os valores" → salvar. `rec` = edição de uma leitura. `all` null = medidas não carregaram. */
export function BodyCompSheet({ profile, all, rec, onClose, onSaved }: {
  profile: Profile; all: Measurement[] | null; rec?: BodyComp; onClose: () => void; onSaved: (warn?: string) => void;
}) {
  const tz = profile.timezone;
  const [stage, setStage] = useState<Stage>(rec ? "form" : "pick");
  const [device, setDevice] = useState(rec?.device ?? "");
  const [date, setDate] = useState(rec ? dayOf(rec.measured_at, tz) : dayOf(new Date().toISOString(), tz));
  const [text, setText] = useState<Partial<Record<keyof BodyCompValues, string>>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, show(rec?.[f.key])])));
  const [ai, setAi] = useState(rec?.ai ?? false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // Arquivo enviado nesta sessão e ainda não salvo (apagado se a pessoa desistir).
  const pending = useRef<string | null>(null);
  const cancelled = useRef(false);

  const cancel = useCallback(() => {
    if (saving) return;
    cancelled.current = true;
    if (pending.current) deleteHealthFile(pending.current).catch(() => {});
    pending.current = null;
    onClose();
  }, [saving, onClose]);

  async function onFile(f?: File) {
    if (!f) return;
    setMsg("");
    setStage("reading");
    let path: string | null = null;
    try {
      path = await uploadHealthFile(f);
      if (cancelled.current) throw new Error("");
      pending.current = path;
      const res = await readHealthDoc<BodyCompDraft>({ mode: "body_comp", paths: [path] });
      if (cancelled.current) throw new Error("");
      if (res.error || !res.draft) throw new Error(res.error || "Não foi possível ler o documento agora.");
      const d = res.draft;
      setDevice(d.device ?? "");
      setDate(dayOf(d.measured_at, tz) || date);
      setText(Object.fromEntries(FIELDS.map((x) => [x.key, show(d[x.key])])));
      setAi(true);
      setStage("form");
    } catch (e) {
      if (path) await deleteHealthFile(path).catch(() => {});
      pending.current = null;
      if (cancelled.current) return;
      setMsg((e as Error).message || "Não foi possível enviar.");
      setStage("pick");
    }
  }

  async function save() {
    const parsed = parseValues(text);
    if ("error" in parsed) return setMsg(parsed.error);
    if (!device.trim()) return setMsg("Informe o aparelho.");
    if (!date) return setMsg("Informe a data.");
    const measuredAt = rec && dayOf(rec.measured_at, tz) === date ? rec.measured_at : new Date(`${date}T12:00:00`).toISOString();
    setSaving(true);
    setMsg("");
    // Na edição o servidor troca arquivo e `ai` pelo que vier: reenvia os atuais.
    const paths = rec ? (rec.file_path ? [rec.file_path] : []) : pending.current ? [pending.current] : [];
    const res = await saveHealthDoc({
      mode: "body_comp", id: rec?.id, paths, ai,
      data: { device: device.trim(), measured_at: measuredAt, ...parsed.values },
    });
    if (res.error) {
      setMsg(res.error);
      setSaving(false);
      return;
    }
    pending.current = null;
    // O peso do laudo também vira medida, se não houver outra naquele dia.
    let warn: string | undefined;
    const w = parsed.values.weight_kg;
    if (!rec && w != null && !all) {
      warn = "Laudo salvo, mas o peso não foi para Peso e medidas: não foi possível carregar suas medidas.";
    } else if (!rec && w != null && all && !all.some((m) => localDay(m.measured_at, tz) === localDay(measuredAt, tz))) {
      try {
        warn = await saveMeasurement({ measured_at: measuredAt, weight_kg: w, waist_cm: null, hip_cm: null, neck_cm: null, source: "body_comp" }, profile);
      } catch {
        warn = "Laudo salvo, mas não foi possível registrar o peso em Peso e medidas.";
      }
    }
    onSaved(warn);
  }

  return (
    <Sheet title="Composição corporal" onClose={cancel}>
      {stage === "pick" && (
        <>
          <p className="note">Envie o laudo da bioimpedância (foto ou PDF). O Yune lê os valores e você confere antes de salvar.</p>
          <input ref={input} type="file" hidden accept="application/pdf,image/*"
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          <button className="btn primary" onClick={() => input.current?.click()}>Enviar laudo</button>
          <button className="btn ghost" onClick={() => { setMsg(""); setStage("form"); }}>Digitar valores</button>
          {msg && <p className="note err">{msg}</p>}
        </>
      )}
      {stage === "reading" && <p className="thinking"><span className="pulse">Lendo o laudo…</span></p>}
      {stage === "form" && (
        <>
          <h3 className="confirm-title">{ai ? "Confira os valores" : rec ? "Editar leitura" : "Valores"}</h3>
          {ai && <p className="note">Lidos do laudo que você enviou. Corrija o que estiver diferente.</p>}
          {ai && <span className="chip chip-static">estimado por IA, confira</span>}
          <div className="row">
            <label className="field"><span>Aparelho</span>
              <input value={device} placeholder="InBody 570" onChange={(e) => setDevice(e.target.value)} /></label>
            <label className="field"><span>Data</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          </div>
          <div className="bc-fields">
            {FIELDS.map((f) => (
              <label className="bc-field" key={f.key}>
                <span>{f.label}{f.unit && ` (${f.unit})`}</span>
                <input inputMode="decimal" placeholder="não informado" value={text[f.key] ?? ""}
                  onChange={(e) => setText({ ...text, [f.key]: e.target.value })} />
              </label>
            ))}
          </div>
          {msg && <p className="note err">{msg}</p>}
          <button className="btn primary" disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar"}</button>
          <p className="note small">Compare sempre no mesmo aparelho e nas mesmas condições (jejum, hidratação).</p>
        </>
      )}
    </Sheet>
  );
}
