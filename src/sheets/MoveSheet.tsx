import { useState } from "react";
import { Segmented, Sheet } from "@/components/Sheet";
import { ACTIVITIES, estimateBurn, type Intensity } from "@/lib/activity";
import { addDoc } from "firebase/firestore";
import { table, type Profile } from "@/lib/firebase";
import { fromLocalInput, toLocalInput } from "@/lib/time";

export function MoveSheet({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState("Caminhada");
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<Intensity>("moderada");
  const [at, setAt] = useState(() => toLocalInput(new Date(Date.now() - 30 * 60_000)));
  const [override, setOverride] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const auto = estimateBurn(kind, minutes, intensity, profile.weight_kg);
  const kcal = override ? Number(override) : auto;

  async function save() {
    setBusy(true);
    const error = await addDoc(table("activities"), {
      started_at: fromLocalInput(at), kind, duration_min: minutes, intensity, kcal, note: null, created_at: new Date().toISOString(),
    }).then(() => null, () => "Não foi possível salvar.");
    setBusy(false);
    if (error) return setErr(error);
    onSaved();
  }

  return (
    <Sheet title="Movimento" accent="move" onClose={onClose}>
      <div className="chips">
        {ACTIVITIES.map((a) => (
          <button key={a.kind} className={kind === a.kind ? "chip on" : "chip"} onClick={() => setKind(a.kind)}>{a.kind}</button>
        ))}
      </div>

      <div className="dial-input">
        <span className="big-num">{minutes}<small>min</small></span>
        <input type="range" min={5} max={180} step={5} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
          aria-label="Duração em minutos" />
      </div>

      <Segmented value={intensity} onChange={setIntensity}
        options={[{ value: "leve", label: "Leve" }, { value: "moderada", label: "Moderada" }, { value: "intensa", label: "Intensa" }]} />

      <div className="row">
        <label className="field">
          <span>Início</span>
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
        </label>
        <label className="field">
          <span>Calorias (do relógio)</span>
          <input inputMode="numeric" value={override} placeholder={String(auto)} onChange={(e) => setOverride(e.target.value.replace(/\D/g, ""))} />
        </label>
      </div>
      {!profile.weight_kg && <p className="note">Informe seu peso em Ajustes para uma estimativa mais precisa.</p>}
      {err && <p className="note err">{err}</p>}
      <div className="actions">
        <button className="btn primary" disabled={busy} onClick={save}>Salvar · −{kcal} kcal</button>
      </div>
    </Sheet>
  );
}
