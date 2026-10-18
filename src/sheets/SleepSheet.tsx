import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { addDoc, getDocs, limit, orderBy, query, updateDoc, where } from "firebase/firestore";
import { row, rows, table, type Sleep } from "@/lib/firebase";
import { addDays, fmtDuration, fmtTime, fromLocalInput, startOfDay, toLocalInput } from "@/lib/time";

const at = (base: Date, h: number, m = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);

const MAX_SLEEP_MIN = 20 * 60;

export function SleepSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = startOfDay(new Date());
  const [open, setOpen] = useState<Sleep | null>(null);
  const [bed, setBed] = useState(() => toLocalInput(at(addDays(today, -1), 23)));
  const [wake, setWake] = useState(() => toLocalInput(at(today, 7)));
  const [err, setErr] = useState("");
  const minutes = (new Date(wake).getTime() - new Date(bed).getTime()) / 60_000;

  useEffect(() => {
    const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
    getDocs(query(table("sleep"), where("wake_at", "==", null), where("bed_at", ">=", since), orderBy("bed_at", "desc"), limit(1)))
      .then((snap) => setOpen(rows<Sleep>(snap)[0] ?? null));
  }, []);

  // As regras do Firestore recusam horários inválidos (acordar antes de deitar, mais de 20 h).
  async function run(p: Promise<unknown>) {
    setErr("");
    try {
      await p;
    } catch {
      return setErr("Confira os horários.");
    }
    onSaved();
  }

  const insert = (bed_at: string, wake_at: string | null) => addDoc(table("sleep"), { bed_at, wake_at, created_at: new Date().toISOString() });

  return (
    <Sheet title="Sono" accent="sleep" onClose={onClose}>
      {open ? (
        <div className="sleep-now">
          <p className="lede">Dormindo desde <b>{fmtTime(open.bed_at)}</b></p>
          <button className="btn primary huge" onClick={() => run(updateDoc(row("sleep", open.id), { wake_at: new Date().toISOString() }))}>
            Acordei
          </button>
        </div>
      ) : (
        <button className="btn ghost huge" onClick={() => run(insert(new Date().toISOString(), null))}>
          Vou dormir agora
        </button>
      )}

      <p className="divider"><span>ou registre a noite</span></p>

      <div className="row">
        <label className="field">
          <span>Deitei</span>
          <input type="datetime-local" value={bed} onChange={(e) => setBed(e.target.value)} />
        </label>
        <label className="field">
          <span>Acordei</span>
          <input type="datetime-local" value={wake} onChange={(e) => setWake(e.target.value)} />
        </label>
      </div>
      {err && <p className="note err">{err}</p>}
      <div className="actions">
        <button className="btn primary" disabled={minutes <= 0 || minutes >= MAX_SLEEP_MIN}
          onClick={() => run(insert(fromLocalInput(bed), fromLocalInput(wake)))}>
          Salvar · {minutes > 0 && minutes < MAX_SLEEP_MIN ? fmtDuration(minutes) : "—"}
        </button>
      </div>
    </Sheet>
  );
}
