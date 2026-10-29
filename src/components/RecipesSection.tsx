import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { deleteDoc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { Segmented } from "@/components/Sheet";
import { FoodSheet } from "@/sheets/FoodSheet";
import { row, rows, table, type Profile, type Recipe, type RecipeUnit } from "@/lib/firebase";
import { parseDecimal } from "@/lib/num";
import { fmtAmount, fmtYield, keptYield, recipeTotals, UNIT_LABEL, YIELD_MAX, YIELD_MIN } from "@/lib/recipes";
import { fmtNum } from "@/lib/time";

const UNITS = (["ml", "g", "porcoes"] as const).map((value) => ({ value, label: UNIT_LABEL[value] }));

/** Ajustes › Minhas receitas. Mudar uma receita não mexe nas refeições já registradas. */
export function RecipesSection({ profile }: { profile: Profile }) {
  const [list, setList] = useState<Recipe[] | null>(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);

  const load = useCallback(() => {
    getDocs(query(table("recipes"), orderBy("updated_at", "desc")))
      .then((snap) => { setList(rows<Recipe>(snap)); setErr(""); })
      .catch(() => setErr("Não foi possível carregar as receitas."));
  }, []);
  useEffect(load, [load]);

  const closeSheet = useCallback(() => setEditing(null), []);
  const savedSheet = useCallback(() => { setEditing(null); load(); }, [load]);

  return (
    <section className="group">
      <h2 className="section-title">Minhas receitas</h2>
      {err && <p className="note err">{err}</p>}
      {list?.length === 0 && <p className="note">Ainda nenhuma. No registro de comida, use “Fiz mais do que comi”.</p>}
      {!!list?.length && (
        <ul className="recipes">
          {list.map((r) => (
            <li key={r.id}>
              <button className="recipe-main" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span><b>{r.name}</b><small>rende {fmtYield(r.yield_amount, r.yield_unit)}</small></span>
                <em>{fmtNum(recipeTotals(r.items).kcal)} kcal</em>
              </button>
              {open === r.id && (
                <RecipeEditor key={r.updated_at} recipe={r} onIngredients={() => setEditing(r)} onChanged={load}
                  onDeleted={() => { setOpen(null); load(); }} />
              )}
            </li>
          ))}
        </ul>
      )}
      {/* No body, como a folha do consentimento: dentro da tela a folha fixa sai do lugar. */}
      {editing && createPortal(
        <FoodSheet profile={profile} plan={null} dietOn={false} recipe={editing}
          onClose={closeSheet} onSaved={savedSheet} onSavedRecipe={savedSheet} />,
        document.body,
      )}
    </section>
  );
}

function RecipeEditor({ recipe, onIngredients, onChanged, onDeleted }: {
  recipe: Recipe;
  onIngredients: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(recipe.name);
  const [yieldText, setYieldText] = useState(fmtAmount(recipe.yield_amount));
  const [unit, setUnit] = useState<RecipeUnit>(recipe.yield_unit);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const amount = keptYield(parseDecimal(yieldText) ?? 0, recipe.yield_amount);
  const problem = !name.trim() ? "Informe o nome." : !(amount >= YIELD_MIN && amount <= YIELD_MAX) ? "Informe quanto rendeu." : null;
  const changed = name.trim() !== recipe.name || amount !== recipe.yield_amount || unit !== recipe.yield_unit;

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await updateDoc(row("recipes", recipe.id), { name: name.trim(), yield_amount: amount, yield_unit: unit, updated_at: new Date().toISOString() });
      onChanged();
    } catch {
      setErr("Não foi possível salvar a receita.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteDoc(row("recipes", recipe.id));
      onDeleted();
    } catch {
      setErr("Não foi possível apagar a receita.");
      setBusy(false);
    }
  }

  return (
    <div className="recipe-edit">
      <label className="field"><span>Nome</span>
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
      <div className="batch-yield">
        <label className="field"><span>Rendeu</span>
          <input inputMode="decimal" value={yieldText} onChange={(e) => setYieldText(e.target.value)} /></label>
        <Segmented value={unit} onChange={setUnit} options={UNITS} />
      </div>
      {problem && <p className="note">{problem}</p>}
      {changed && <button className="btn primary" disabled={!!problem || busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>}
      <button className="btn ghost" onClick={onIngredients}>Editar ingredientes</button>
      {confirm ? (
        <div className="row">
          <p className="note">Apaga a receita. As refeições já registradas continuam iguais.</p>
          <button className="btn ghost" onClick={() => setConfirm(false)}>Manter</button>
          <button className="btn danger" disabled={busy} onClick={remove}>Apagar receita</button>
        </div>
      ) : (
        <button className="link danger" onClick={() => setConfirm(true)}>Apagar</button>
      )}
      {err && <p className="note err">{err}</p>}
    </div>
  );
}
