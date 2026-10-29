import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addDoc, updateDoc } from "firebase/firestore";
import { fluidsOn } from "@/lib/data";
import { fluidLabel } from "@/lib/fluids";
import { containersOf, validContainers, waterView, type Fluids } from "@/lib/waterView";
import { profileDoc, row, table, type Profile, type Water } from "@/lib/firebase";
import { backfillAt, fmtDayLong, fmtLiters, fmtNum, fromLocalInput, sameDay, toLocalInput } from "@/lib/time";

const validMl = (ml: number) => Number.isInteger(ml) && ml >= 10 && ml <= 3000;

const dateOf = (local: string) => local.slice(0, 10);

// Meio recipiente; nunca abaixo de 10 ml (mínimo das regras).
const half = (ml: number) => Math.max(10, Math.round(ml / 2));

type Draft = { key: number; name: string; ml: string };

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
  const containers = containersOf(profile);
  const [base, setBase] = useState<Fluids | null>(null);
  const [added, setAdded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<Draft[] | null>(null);
  const nextKey = useRef(0);
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

  const draft = (name: string, ml: string): Draft => ({ key: nextKey.current++, name, ml });

  function startEditing() {
    setErr("");
    setEditing(containers.map((c) => draft(c.name, String(c.ml))));
  }

  function patch(i: number, change: Partial<Draft>) {
    setEditing(editing!.map((d, j) => (j === i ? { ...d, ...change } : d)));
  }

  function move(i: number, by: -1 | 1) {
    const next = [...editing!];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setEditing(next);
  }

  async function saveContainers() {
    // ml vazio vira NaN, que validContainers recusa.
    const next = editing!.map((d) => ({ name: d.name.trim(), ml: d.ml ? Number(d.ml) : NaN }));
    const invalid = validContainers(next);
    if (invalid) return setErr(invalid);
    setErr("");
    const error = await updateDoc(profileDoc(profile.id), { water_containers: next })
      .then(() => null, () => "Não foi possível salvar.");
    if (error) return setErr(error);
    setEditing(null);
    onProfile();
  }

  if (water) {
    return <EditWater water={water} sizes={[...new Set(containers.map((c) => c.ml))]} onClose={onClose} onSaved={onSaved} />;
  }

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
          <p className="eyebrow">Meus recipientes</p>
          <div className="container-edit">
            {editing.map((d, i) => {
              const what = d.name.trim() || `recipiente ${i + 1}`;
              return (
              <div key={d.key} className="container-row">
                <label className="field">
                  <input value={d.name} maxLength={40} placeholder="Nome" aria-label={`Nome do recipiente ${i + 1}`}
                    onChange={(e) => patch(i, { name: e.target.value })} />
                </label>
                <label className="water-size">
                  <input inputMode="numeric" value={d.ml} aria-label={`${what} (ml)`}
                    onChange={(e) => patch(i, { ml: e.target.value.replace(/\D/g, "") })} />
                  <small>ml</small>
                </label>
                <button className="icon-btn" disabled={i === 0} aria-label={`Subir ${what}`} onClick={() => move(i, -1)}>↑</button>
                <button className="icon-btn" disabled={i === editing.length - 1} aria-label={`Descer ${what}`} onClick={() => move(i, 1)}>↓</button>
                <button className="icon-btn" disabled={editing.length === 1} aria-label={`Remover ${what}`}
                  onClick={() => setEditing(editing.filter((_, j) => j !== i))}>×</button>
              </div>
              );
            })}
          </div>
          {editing.length < 6 && (
            <button className="link" onClick={() => setEditing([...editing, draft("", "")])}>Adicionar recipiente</button>
          )}
          <div className="row">
            <button className="btn ghost" onClick={() => { setEditing(null); setErr(""); }}>Cancelar</button>
            <button className="btn primary" onClick={saveContainers}>Salvar</button>
          </div>
        </>
      ) : (
        <>
          <div className="containers">
            {containers.map((c, i) => (
              <div key={i} className="container">
                <button className="btn ghost" disabled={!view.canAdd} onClick={() => add(c.ml)}
                  aria-label={`${c.name}: mais ${fmtNum(c.ml)} ml`}>
                  <span>{c.name}</span><small>+{fmtNum(c.ml)} ml</small>
                </button>
                <button className="btn ghost half" disabled={!view.canAdd} onClick={() => add(half(c.ml))}
                  aria-label={`${c.name}, metade: mais ${fmtNum(half(c.ml))} ml`}>½</button>
              </div>
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
          <button className="link" onClick={startEditing}>Meus recipientes</button>
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
