import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addDoc } from "firebase/firestore";
import { table, type Profile } from "@/lib/firebase";
import { fmtLiters } from "@/lib/time";

export function WaterSheet({ profile, todayMl, onClose, onSaved }: { profile: Profile; todayMl: number; onClose: () => void; onSaved: () => void }) {
  const [total, setTotal] = useState(todayMl);
  const [custom, setCustom] = useState("");
  const [err, setErr] = useState("");
  const frac = Math.min(total / profile.water_goal_ml, 1);

  async function add(ml: number) {
    if (!ml) return;
    const error = await addDoc(table("water"), { ml, drank_at: new Date().toISOString(), created_at: new Date().toISOString() })
      .then(() => null, () => "Quantidade inválida.");
    if (error) return setErr(error);
    setTotal((t) => t + ml);
    navigator.vibrate?.(8);
    onSaved();
  }

  return (
    <Sheet title="Água" accent="water" onClose={onClose}>
      <div className="glass" aria-label={`${fmtLiters(total)} de ${fmtLiters(profile.water_goal_ml)} litros`}>
        <div className="glass-fill" style={{ height: `${frac * 100}%` }} />
        <span className="big-num">{fmtLiters(total)}<small>/ {fmtLiters(profile.water_goal_ml)} L</small></span>
      </div>
      <div className="water-buttons">
        {[150, 250, 350, 500].map((ml) => (
          <button key={ml} className="btn ghost" onClick={() => add(ml)}>+{ml}<small>ml</small></button>
        ))}
      </div>
      <div className="row">
        <label className="field">
          <span>Outra quantidade (ml)</span>
          <input inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ""))} />
        </label>
        <button className="btn" disabled={!custom} onClick={() => { add(Number(custom)); setCustom(""); }}>Adicionar</button>
      </div>
      {err && <p className="note err">{err}</p>}
    </Sheet>
  );
}
