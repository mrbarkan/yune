import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addDoc, updateDoc } from "firebase/firestore";
import { todayWaterMl } from "@/lib/data";
import { waterView } from "@/lib/waterView";
import { DEFAULT_WATER_SIZES, profileDoc, row, table, type Profile, type Water } from "@/lib/firebase";
import { fmtLiters, fmtNum, fromLocalInput, toLocalInput } from "@/lib/time";

const validMl = (ml: number) => Number.isInteger(ml) && ml >= 10 && ml <= 3000;

/** Copos rápidos do dia, ou o registro `water` já salvo para corrigir. */
export function WaterSheet({ profile, water, onClose, onSaved, onProfile }: {
  profile: Profile;
  water?: Water;
  onClose: () => void;
  onSaved: () => void;
  onProfile: () => void;
}) {
  const sizes = profile.water_sizes?.length === 4 ? profile.water_sizes : DEFAULT_WATER_SIZES;
  const [base, setBase] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<string[] | null>(null);
  const view = waterView({ base, failed }, added);
  const frac = Math.min((view.total ?? 0) / profile.water_goal_ml, 1);

  useEffect(() => {
    if (water) return;
    let alive = true;
    todayWaterMl().then(
      (ml) => alive && setBase(ml),
      () => {
        if (!alive) return;
        setFailed(true);
        setErr("Não foi possível carregar a água de hoje.");
      },
    );
    return () => {
      alive = false;
    };
  }, [water]);

  async function add(ml: number) {
    if (!ml) return;
    const error = await addDoc(table("water"), { ml, drank_at: new Date().toISOString(), created_at: new Date().toISOString() })
      .then(() => null, () => "Quantidade inválida.");
    if (error) return setErr(error);
    setAdded((a) => a + ml);
    navigator.vibrate?.(8);
    onSaved();
  }

  async function saveSizes() {
    const next = editing!.map(Number);
    if (!next.every(validMl)) return setErr("Use valores entre 10 e 3000 ml.");
    setErr("");
    const error = await updateDoc(profileDoc(profile.id), { water_sizes: [...next].sort((a, b) => a - b) })
      .then(() => null, () => "Não foi possível salvar.");
    if (error) return setErr(error);
    setEditing(null);
    onProfile();
  }

  if (water) return <EditWater water={water} sizes={sizes} onClose={onClose} onSaved={onSaved} />;

  return (
    <Sheet title="Água" accent="water" onClose={onClose}>
      <div className="glass" aria-label={view.total === null ? "Total de hoje indisponível" : `${fmtLiters(view.total)} de ${fmtLiters(profile.water_goal_ml)} litros`}>
        <div className="glass-fill" style={{ height: `${frac * 100}%` }} />
        <span className="big-num">{view.total === null ? "—" : fmtLiters(view.total)}<small>/ {fmtLiters(profile.water_goal_ml)} L</small></span>
      </div>

      {editing ? (
        <>
          <div className="water-buttons">
            {editing.map((v, i) => (
              <label key={i} className="water-size">
                <input inputMode="numeric" value={v} aria-label={`Copo ${i + 1} (ml)`}
                  onChange={(e) => setEditing(editing.map((x, j) => (j === i ? e.target.value.replace(/\D/g, "") : x)))} />
                <small>ml</small>
              </label>
            ))}
          </div>
          <div className="row">
            <button className="btn ghost" onClick={() => { setEditing(null); setErr(""); }}>Cancelar</button>
            <button className="btn primary" onClick={saveSizes}>Salvar copos</button>
          </div>
        </>
      ) : (
        <>
          <div className="water-buttons">
            {sizes.map((ml, i) => (
              <button key={i} className="btn ghost" disabled={!view.canAdd} onClick={() => add(ml)}>+{fmtNum(ml)}<small>ml</small></button>
            ))}
          </div>
          <button className="link" onClick={() => setEditing(sizes.map(String))}>Ajustar copos</button>
          <div className="row">
            <label className="field">
              <span>Outra quantidade (ml)</span>
              <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
            </label>
            <button className="btn" disabled={!custom || !view.canAdd} onClick={() => { add(Number(custom)); setCustom(""); }}>Adicionar</button>
          </div>
        </>
      )}
      {view.onlyAdded !== null && <p className="note">+{fmtNum(view.onlyAdded)} ml registrados</p>}
      {err && <p className="note err">{err}</p>}
    </Sheet>
  );
}

function EditWater({ water, sizes, onClose, onSaved }: { water: Water; sizes: number[]; onClose: () => void; onSaved: () => void }) {
  const [ml, setMl] = useState(String(water.ml));
  const [at, setAt] = useState(() => toLocalInput(new Date(water.drank_at)));
  const [err, setErr] = useState("");
  const value = Number(ml);

  async function save() {
    const error = await updateDoc(row("water", water.id), { ml: value, drank_at: fromLocalInput(at) })
      .then(() => null, () => "Quantidade inválida.");
    if (error) return setErr(error);
    onSaved();
  }

  return (
    <Sheet title="Água" accent="water" onClose={onClose}>
      <div className="water-buttons">
        {sizes.map((s, i) => (
          <button key={i} className={value === s ? "btn on" : "btn ghost"} onClick={() => setMl(String(s))}>{fmtNum(s)}<small>ml</small></button>
        ))}
      </div>
      <div className="row">
        <label className="field">
          <span>Quantidade (ml)</span>
          <input inputMode="numeric" value={ml} onChange={(e) => setMl(e.target.value.replace(/\D/g, ""))} />
        </label>
        <label className="field">
          <span>Horário</span>
          <input type="datetime-local" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} />
        </label>
      </div>
      {err && <p className="note err">{err}</p>}
      <div className="actions">
        <button className="btn primary" disabled={!validMl(value)} onClick={save}>Salvar alterações · {fmtNum(value)} ml</button>
      </div>
    </Sheet>
  );
}
