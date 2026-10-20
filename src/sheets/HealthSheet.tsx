import { useCallback, useEffect, useRef, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { Sheet } from "@/components/Sheet";
import supplements from "@/data/supplements.json";
import {
  avgSleepHours, BRISTOL, completion, createAutosaver, saveAnswers, sectionDone, visibleSections,
  type Answers, type SaveStatus, type FieldDef, type SectionDef, type Value,
} from "@/lib/anamnesis";
import { parseDecimal } from "@/lib/num";
import { rows, table, type Profile, type Sleep } from "@/lib/firebase";

const SUPPLEMENT_NAMES = [...new Set((supplements as { name: string }[]).map((s) => s.name))];

type Props = { profile: Profile; initial: Answers; onClose: () => void; onSaved: () => void };

/** Questionário "Sua saúde": uma versão por dia, salva sozinho 1 s depois da última mudança e ao fechar. */
export function HealthSheet({ profile, initial, onClose, onSaved }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("");
  const latest = useRef(answers);
  const tz = useRef(profile.timezone);
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const saver = useRef<ReturnType<typeof createAutosaver>>(undefined);
  if (!saver.current) {
    saver.current = createAutosaver(() => saveAnswers(latest.current, new Date(), tz.current), 1000, setStatus);
  }
  const s = saver.current;

  // Se a tela sair sem passar por "fechar", grava a pendência uma vez e avisa o Perfil.
  useEffect(() => () => {
    void s.dispose().then(() => s.wrote && onSavedRef.current());
  }, [s]);

  const flush = s.flush;

  const change = useCallback((section: SectionDef["key"], key: string, v: Value) => {
    latest.current = { ...latest.current, [section]: { ...latest.current[section], [key]: v } };
    setAnswers(latest.current);
    s.touch();
  }, [s]);

  // Horas de sono: média dos últimos 14 dias, só preenche se estiver vazio (e não cria versão sozinha).
  useEffect(() => {
    let alive = true;
    const now = new Date();
    const from = new Date(now.getTime() - 14 * 86_400_000).toISOString();
    getDocs(query(table("sleep"), where("wake_at", ">=", from)))
      .then((snap) => {
        const avg = avgSleepHours(rows<Sleep>(snap), now);
        if (!alive || avg == null || latest.current.rotina?.horas_sono != null) return;
        const next = { ...latest.current, rotina: { ...latest.current.rotina, horas_sono: avg } };
        latest.current = next;
        setAnswers(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Sai da tela só se salvou; se falhar, fica aberta com o erro.
  const close = useCallback(() => {
    void flush().then((ok) => {
      if (ok) onClose();
    });
  }, [flush, onClose]);

  const pct = completion(answers, profile);

  return (
    <Sheet title="Sua saúde" onClose={close}>
      <p className="note">{pct}% preenchido · preencha na ordem que quiser</p>
      <div className="health-list">
        {visibleSections(profile).map((s) => (
          <section key={s.key} className="health-sec">
            <button className="health-head" aria-expanded={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)}>
              <span className={sectionDone(answers, s.key) ? "tick on" : "tick"} aria-hidden>{sectionDone(answers, s.key) ? "✓" : ""}</span>
              <span>{s.title}</span>
            </button>
            {open === s.key && (
              <div className="health-body">
                {s.fields.map((f) => (
                  <Field key={f.key} def={f} sectionKey={s.key} value={answers[s.key]?.[f.key] ?? null}
                    onChange={(v) => change(s.key, f.key, v)} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <p className={`note save-state${status === "error" ? " err" : ""}`} role="status">
        {status === "saving" ? "Salvando…" : status === "saved" ? "Salvo" : status === "error" ? "Não foi possível salvar. Toque em Tentar de novo." : " "}
      </p>
      {status === "error" && <button className="btn ghost small" onClick={() => void flush()}>Tentar de novo</button>}
    </Sheet>
  );
}

function Field({ def, sectionKey, value, onChange }: { def: FieldDef; sectionKey: string; value: Value; onChange: (v: Value) => void }) {
  const id = `${sectionKey}-${def.key}`;
  switch (def.kind) {
    case "text":
      return <label className="field"><span>{def.label}</span>
        <input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></label>;
    case "longtext":
      return (
        <label className="field"><span>{def.label}</span>
          <textarea rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
          {sectionKey === "suplementos" && <SupplementAdd onAdd={(n) => onChange(((value as string) ?? "").trim() ? `${(value as string).trim()}, ${n}` : n)} />}
        </label>
      );
    case "number":
      return <NumberField def={def} value={value as number | null} onChange={onChange} />;
    case "choice":
      return (
        <div className="field" role="group" aria-labelledby={id}><span id={id}>{def.label}</span>
          <div className="chips">
            {def.options!.map((o) => (
              <button key={o} className={`chip${value === o ? " on" : ""}`} aria-pressed={value === o}
                onClick={() => onChange(value === o ? null : o)}>{o}</button>
            ))}
          </div>
        </div>
      );
    case "multi": {
      const cur = Array.isArray(value) ? value : [];
      return (
        <div className="field" role="group" aria-labelledby={id}><span id={id}>{def.label}</span>
          <div className="chips">
            {def.options!.map((o) => (
              <button key={o} className={`chip${cur.includes(o) ? " on" : ""}`} aria-pressed={cur.includes(o)}
                onClick={() => onChange(cur.includes(o) ? cur.filter((x) => x !== o) : [...cur, o])}>{o}</button>
            ))}
          </div>
        </div>
      );
    }
    case "scale":
    case "bristol": {
      const nums = Array.from({ length: (def.max ?? 5) - (def.min ?? 1) + 1 }, (_, i) => (def.min ?? 1) + i);
      return (
        <div className="field" role="group" aria-labelledby={id}><span id={id}>{def.label}</span>
          <div className="chips">
            {nums.map((n) => (
              <button key={n} className={`chip${value === n ? " on" : ""}`} aria-pressed={value === n}
                onClick={() => onChange(value === n ? null : n)}>{n}</button>
            ))}
          </div>
          {def.kind === "bristol" && (
            <ul className="bristol">
              {BRISTOL.map((t, i) => <li key={t} className={value === i + 1 ? "on" : ""}>{t}</li>)}
            </ul>
          )}
        </div>
      );
    }
  }
}

/** Campo com sugestões de nomes do catálogo de suplementos; acrescenta o nome à lista. */
function SupplementAdd({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState("");
  const add = () => {
    if (v.trim()) onAdd(v.trim());
    setV("");
  };
  return (
    <span className="supp-add">
      <input list="supp-names" placeholder="Buscar e adicionar" value={v} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <datalist id="supp-names">{SUPPLEMENT_NAMES.map((n) => <option key={n} value={n} />)}</datalist>
      <button type="button" className="btn ghost small" onClick={add}>Adicionar</button>
    </span>
  );
}

/** Número com texto local: "7," continua "7,"; só grava valor válido dentro de min/max. */
function NumberField({ def, value, onChange }: { def: FieldDef; value: number | null; onChange: (v: Value) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value).replace(".", ","));
  const [hint, setHint] = useState("");
  // Valor que chega de fora (média de sono) entra se o campo estiver vazio.
  useEffect(() => {
    if (value != null && text.trim() === "") setText(String(value).replace(".", ","));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  function edit(t: string) {
    setText(t);
    if (t.trim() === "") { setHint(""); onChange(null); return; }
    const n = parseDecimal(t);
    if (n == null) { setHint("Digite um número."); return; }
    if ((def.min != null && n < def.min) || (def.max != null && n > def.max)) {
      setHint(`Use um valor entre ${def.min ?? 0} e ${def.max}.`);
      return;
    }
    setHint("");
    onChange(n);
  }
  return (
    <label className="field"><span>{def.label}</span>
      <input inputMode="decimal" value={text} onChange={(e) => edit(e.target.value)} />
      {hint && <small className="note err">{hint}</small>}
    </label>
  );
}
