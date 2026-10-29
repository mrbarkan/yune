import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addDoc, updateDoc } from "firebase/firestore";
import { fluidsOn } from "@/lib/data";
import { fluidLabel } from "@/lib/fluids";
import { waterView, type Fluids } from "@/lib/waterView";
import { DEFAULT_WATER_SIZES, profileDoc, row, table, type Profile, type Water } from "@/lib/firebase";
import { backfillAt, fmtDayLong, fmtLiters, fmtNum, fromLocalInput, sameDay, toLocalInput } from "@/lib/time";

const validMl = (ml: number) => Number.isInteger(ml) && ml >= 10 && ml <= 3000;

const dateOf = (local: string) => local.slice(0, 10);

/** Copos rápidos (agora ou num horário escolhido), ou o registro `water` já salvo para corrigir. */
export function WaterSheet({ profile, water, day, onClose, onSaved, onProfile }: {
  profile: Profile;
  water?: Water;
  /** Dia visto em Hoje: num dia anterior os copos começam nessa data. */
  day?: Date;
  onClose: () => void;
  onSaved: () => void;
  onProfile: () => void;
}) {
  const sizes = profile.water_sizes?.length === 4 ? profile.water_sizes : DEFAULT_WATER_SIZES;
  const [base, setBase] = useState<Fluids | null>(null);
  const [added, setAdded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<string[] | null>(null);
  // Horário dos copos novos: null = agora. Escolhido, vale para os próximos copos (registrar tudo à noite).
  const [at, setAt] = useState<string | null>(() => (day && !sameDay(day, new Date()) ? toLocalInput(backfillAt(day, new Date())) : null));
  const today = dateOf(toLocalInput(new Date()));
  const shown = at ? dateOf(at) : today;
  const view = waterView({ base, failed }, added);
  // Duas camadas: água pura embaixo, bebidas das refeições por cima (as duas juntas até 100%).
  const waterFrac = Math.min((view.water ?? 0) / profile.water_goal_ml, 1);
  const drinksFrac = Math.min((view.drinks ?? 0) / profile.water_goal_ml, 1 - waterFrac);
  const goal = fmtLiters(profile.water_goal_ml);
  const label = view.total === null
    ? `Total ${shown === today ? "de hoje" : "do dia"} indisponível`
    : `${fmtLiters(view.total)} de ${goal} litros${view.drinks ? `: ${fmtLiters(view.water ?? 0)} de água e ${fmtLiters(view.drinks)} de bebidas das refeições` : ""}`;

  useEffect(() => {
    if (water) return;
    let alive = true;
    fluidsOn(new Date(`${shown}T00:00`)).then(
      (f) => alive && setBase(f),
      () => {
        if (!alive) return;
        setFailed(true);
        setErr(shown === today ? "Não foi possível carregar a água de hoje." : "Não foi possível carregar a água desse dia.");
      },
    );
    return () => {
      alive = false;
    };
  }, [water, shown, today]);

  // Outro dia: o copo passa a mostrar o total daquele dia.
  function chooseAt(next: string | null) {
    if ((next ? dateOf(next) : today) !== shown) {
      setBase(null);
      setFailed(false);
      setAdded(0);
      setErr("");
    }
    setAt(next);
  }

  async function add(ml: number) {
    if (!ml) return;
    const now = new Date().toISOString();
    const error = await addDoc(table("water"), { ml, drank_at: at ? fromLocalInput(at) : now, created_at: now })
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
      <div className="glass" role="img" aria-label={label}>
        <div className="glass-fill" style={{ height: `${waterFrac * 100}%` }} />
        {drinksFrac > 0 && <div className="glass-fill drinks" style={{ bottom: `${waterFrac * 100}%`, height: `${drinksFrac * 100}%` }} />}
        <span className="big-num">{view.total === null ? "—" : fmtLiters(view.total)}<small>/ {goal} L</small></span>
        {view.total !== null && view.drinks ? <small className="glass-sub">{fluidLabel(view.total, view.water ?? 0)}</small> : null}
      </div>
      {shown !== today && <p className="note">Água de {fmtDayLong(new Date(`${shown}T00:00`))}</p>}

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
          {at === null ? (
            <button className="link" onClick={() => chooseAt(toLocalInput(new Date()))}>Horário: agora · mudar</button>
          ) : (
            <div className="row">
              <label className="field">
                <span>Horário dos copos</span>
                <input type="datetime-local" value={at} onChange={(e) => e.target.value && chooseAt(e.target.value)} />
              </label>
              <button className="btn ghost" onClick={() => chooseAt(null)}>Agora</button>
            </div>
          )}
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
