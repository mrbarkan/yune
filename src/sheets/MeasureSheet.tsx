import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { Measurement, Profile } from "@/lib/firebase";
import { saveMeasurement } from "@/lib/measurements";
import { parseDecimal } from "@/lib/num";
import { fromLocalInput, toLocalInput } from "@/lib/time";

const show = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

/** Peso obrigatório; cintura, quadril e pescoço opcionais. */
export function MeasureSheet({ profile, rec, onClose, onSaved }: {
  profile: Profile; rec?: Measurement; onClose: () => void; onSaved: (warn?: string) => void;
}) {
  const [weight, setWeight] = useState(show(rec?.weight_kg));
  const [waist, setWaist] = useState(show(rec?.waist_cm));
  const [hip, setHip] = useState(show(rec?.hip_cm));
  const [neck, setNeck] = useState(show(rec?.neck_cm));
  const [when, setWhen] = useState(toLocalInput(rec ? new Date(rec.measured_at) : new Date()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    const w = parseDecimal(weight);
    const opt = (s: string) => (s.trim() === "" ? null : parseDecimal(s));
    const [wa, hi, ne] = [opt(waist), opt(hip), opt(neck)];
    if (w == null || w < 20 || w > 400) return setMsg("Informe o peso entre 20 e 400 kg.");
    if ((wa != null && (wa < 30 || wa > 250)) || (hi != null && (hi < 30 || hi > 250))) return setMsg("Cintura e quadril: entre 30 e 250 cm.");
    if (ne != null && (ne < 20 || ne > 80)) return setMsg("Pescoço: entre 20 e 80 cm.");
    if ((waist.trim() && wa == null) || (hip.trim() && hi == null) || (neck.trim() && ne == null)) return setMsg("Confira os números.");
    if (!when) return setMsg("Informe a data.");
    setBusy(true);
    setMsg("");
    try {
      const warn = await saveMeasurement(
        { measured_at: fromLocalInput(when), weight_kg: w, waist_cm: wa, hip_cm: hi, neck_cm: ne, source: rec?.source ?? "manual", created_at: rec?.created_at },
        profile, rec?.id,
      );
      onSaved(warn);
    } catch {
      setMsg("Não foi possível salvar. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <Sheet title={rec ? "Editar medida" : "Medir"} onClose={onClose}>
      <label className="field"><span>Peso (kg)</span>
        <input inputMode="decimal" autoFocus placeholder="71,8" value={weight} onChange={(e) => setWeight(e.target.value)} /></label>
      <div className="row three">
        <label className="field"><span>Cintura (cm)</span>
          <input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} /></label>
        <label className="field"><span>Quadril (cm)</span>
          <input inputMode="decimal" value={hip} onChange={(e) => setHip(e.target.value)} /></label>
        <label className="field"><span>Pescoço (cm)</span>
          <input inputMode="decimal" value={neck} onChange={(e) => setNeck(e.target.value)} /></label>
      </div>
      <label className="field"><span>Quando</span>
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
      {msg && <p className="note err">{msg}</p>}
      <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
    </Sheet>
  );
}
