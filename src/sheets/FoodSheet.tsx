import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { supabase, type FoodItem, type Meal } from "@/lib/supabase";
import { fmtNum, fromLocalInput, toLocalInput } from "@/lib/time";

type Estimate = { items: FoodItem[]; total_kcal: number; notes: string };

export function FoodSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [est, setEst] = useState<Estimate | null>(null);
  const [kcal, setKcal] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recent, setRecent] = useState<Meal[]>([]);

  useEffect(() => {
    supabase.from("meals").select("*").order("eaten_at", { ascending: false }).limit(40).then(({ data }) => {
      const seen = new Set<string>();
      setRecent(((data ?? []) as Meal[]).filter((m) => {
        const k = m.description.toLowerCase();
        return !seen.has(k) && seen.add(k);
      }).slice(0, 6));
    });
  }, []);

  async function estimate() {
    setBusy(true);
    setErr("");
    const { data, error } = await supabase.functions.invoke("estimate-food", { body: { description: text } });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? "Não foi possível calcular agora. Informe as calorias manualmente.");
    setEst(data as Estimate);
    setKcal(String((data as Estimate).total_kcal));
  }

  async function save(row?: Partial<Meal>) {
    setBusy(true);
    const sum = (k: keyof FoodItem) => est?.items.reduce((s, i) => s + Number(i[k] || 0), 0) ?? null;
    const { error } = await supabase.from("meals").insert(row ?? {
      eaten_at: fromLocalInput(at),
      description: text.trim(),
      kcal: Number(kcal) || 0,
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      items: est?.items ?? null,
      source: est ? "ai" : "manual",
    });
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  }

  const repeat = (m: Meal) =>
    save({ eaten_at: fromLocalInput(at), description: m.description, kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g, items: m.items, source: m.source });

  return (
    <Sheet title="O que você comeu?" accent="food" onClose={onClose}>
      <textarea className="big-input" rows={3} autoFocus value={text} maxLength={600}
        placeholder="2 ovos mexidos, 1 pão francês na chapa e um café com leite"
        onChange={(e) => { setText(e.target.value); setEst(null); }} />

      {!est && recent.length > 0 && !text && (
        <div className="chips" aria-label="Repetir refeição recente">
          {recent.map((m) => (
            <button key={m.id} className="chip" onClick={() => repeat(m)} disabled={busy}>
              {m.description.length > 34 ? m.description.slice(0, 32) + "…" : m.description} <em>{fmtNum(m.kcal)}</em>
            </button>
          ))}
        </div>
      )}

      {est && (
        <ul className="estimate">
          {est.items.map((i, n) => (
            <li key={n}>
              <span><b>{i.name}</b><small>{i.quantity}</small></span>
              <span className="num">{fmtNum(i.kcal)}</span>
            </li>
          ))}
          {est.notes && <li className="estimate-note">{est.notes}</li>}
        </ul>
      )}

      <div className="row">
        <label className="field">
          <span>Horário</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Calorias</span>
          <input inputMode="numeric" value={kcal} placeholder={est ? "" : "auto"} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>

      {err && <p className="note err">{err}</p>}

      <div className="actions">
        {!est && !kcal ? (
          <button className="btn primary" disabled={busy || !text.trim()} onClick={estimate}>
            {busy ? <span className="pulse">Calculando</span> : "Calcular calorias"}
          </button>
        ) : (
          <button className="btn primary" disabled={busy || !text.trim()} onClick={() => save()}>
            Salvar · {fmtNum(Number(kcal) || 0)} kcal
          </button>
        )}
      </div>
    </Sheet>
  );
}
