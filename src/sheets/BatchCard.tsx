import { useState } from "react";
import { Segmented } from "@/components/Sheet";
import type { RecipeUnit } from "@/lib/firebase";
import { parseDecimal } from "@/lib/num";
import { batchValid, suggestRecipeName, UNIT_LABEL } from "@/lib/recipes";
import { fmtNum } from "@/lib/time";
import type { PlateLine } from "./FoodSheet";

export type BatchResult = { name: string; picked: string[]; yield_amount: number; yield_unit: RecipeUnit; eaten: number };

const UNITS = (["ml", "g", "porcoes"] as const).map((value) => ({ value, label: UNIT_LABEL[value] }));

/** "Fiz mais do que comi": os itens marcados viram uma receita e só a parte comida fica no prato. */
export function BatchCard({ items, onCancel, onSave }: {
  items: PlateLine[];
  onCancel: () => void;
  onSave: (r: BatchResult) => Promise<void>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  // null = o nome acompanha a sugestão até a pessoa digitar.
  const [name, setName] = useState<string | null>(null);
  const [yieldText, setYieldText] = useState("");
  const [eatenText, setEatenText] = useState("");
  const [unit, setUnit] = useState<RecipeUnit>("ml");
  const [busy, setBusy] = useState(false);

  const ticked = items.filter((l) => picked.includes(l.id));
  const shownName = name ?? suggestRecipeName(ticked.map((l) => ({ name: l.food.name, quantity: "", grams: l.portion.g * l.qty, ...l.n })));
  const yieldAmount = parseDecimal(yieldText) ?? 0;
  const eaten = parseDecimal(eatenText) ?? 0;
  const problem = ticked.length ? batchValid(yieldAmount, eaten) : "Marque o que entrou no preparo.";
  const ready = !problem && shownName.trim().length > 0;

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function save() {
    setBusy(true);
    try {
      await onSave({ name: shownName.trim(), picked: ticked.map((l) => l.id), yield_amount: yieldAmount, yield_unit: unit, eaten });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="label-card batch-card">
      <p className="eyebrow">Fiz mais do que comi</p>
      <ul className="batch-items">
        {items.map((l) => (
          <li key={l.id}>
            <label>
              <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} />
              <span>{l.food.name}</span>
              <small>{fmtNum(l.n.kcal)}</small>
            </label>
          </li>
        ))}
      </ul>
      <label className="field"><span>Nome</span>
        <input value={shownName} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <div className="batch-yield">
        <label className="field"><span>Rendeu</span>
          <input inputMode="decimal" value={yieldText} placeholder="500" onChange={(e) => setYieldText(e.target.value)} /></label>
        <Segmented value={unit} onChange={setUnit} options={UNITS} />
      </div>
      <label className="field"><span>Comi/tomei ({UNIT_LABEL[unit]})</span>
        <input inputMode="decimal" value={eatenText} placeholder="200" onChange={(e) => setEatenText(e.target.value)} /></label>
      {problem && <p className="note">{problem}</p>}
      <div className="row">
        <button className="btn ghost" onClick={onCancel}>Cancelar</button>
        <button className="btn primary" disabled={!ready || busy} onClick={save}>{busy ? "Salvando…" : "Salvar e adicionar"}</button>
      </div>
    </div>
  );
}
