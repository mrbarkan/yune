import { useCallback, useEffect, useRef, useState } from "react";
import { getDocs, query, where } from "firebase/firestore";
import { Sheet } from "@/components/Sheet";
import supplements from "@/data/supplements.json";
import {
  avgSleepHours, BRISTOL, completion, saveAnswers, sectionDone, visibleSections,
  type Answers, type FieldDef, type SectionDef, type Value,
} from "@/lib/anamnesis";
import { rows, table, type Profile, type Sleep } from "@/lib/firebase";

const SUPPLEMENT_NAMES = [...new Set((supplements as { name: string }[]).map((s) => s.name))];

type Status = "" | "saving" | "saved" | "error";

type Props = { profile: Profile; initial: Answers; onClose: () => void; onSaved: () => void };

/** Questionário "Sua saúde": uma versão por dia, salva sozinho 1 s depois da última mudança e ao fechar. */
export function HealthSheet({ profile, initial, onClose, onSaved }: Props) {
  const [answers, setAnswers] = useState<Answers>(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("");
  const latest = useRef(answers);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const wrote = useRef(false);

  // Salva o que estiver pendente; erro volta para quem chamou e fica na tela.
  const flush = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    const run = chain.current.then(async () => {
      if (!dirty.current) return;
      dirty.current = false;
      setStatus("saving");
      try {
        await saveAnswers(latest.current, new Date(), profile.timezone);
        wrote.current = true;
        setStatus(dirty.current ? "saving" : "saved");
      } catch (e) {
        dirty.current = true;
        setStatus("error");
        throw e;
      }
    });
    chain.current = run.catch(() => {});
    return run.then(() => true, () => false);
  }, [profile.timezone]);

  const change = useCallback((section: SectionDef["key"], key: string, v: Value) => {
    const next = { ...latest.current, [section]: { ...latest.current[section], [key]: v } };
    latest.current = next;
    dirty.current = true;
    setAnswers(next);
    setStatus("");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1000);
  }, [flush]);

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
      if (!ok) return;
      if (wrote.current) onSaved();
      onClose();
    });
  }, [flush, onClose, onSaved]);

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
      return <label className="field"><span>{def.label}</span>
        <input inputMode="decimal" value={value == null ? "" : String(value).replace(".", ",")}
          onChange={(e) => {
            const t = e.target.value.trim();
            const n = Number(t.replace(",", "."));
            onChange(t === "" || Number.isNaN(n) ? null : n);
          }} /></label>;
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
