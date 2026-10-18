import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { supabase, type Sleep } from "@/lib/supabase";
import { addDays, fmtDuration, fmtTime, fromLocalInput, startOfDay, toLocalInput } from "@/lib/time";

const at = (base: Date, h: number, m = 0) => new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m);

export function SleepSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const today = startOfDay(new Date());
  const [open, setOpen] = useState<Sleep | null>(null);
  const [bed, setBed] = useState(() => toLocalInput(at(addDays(today, -1), 23)));
  const [wake, setWake] = useState(() => toLocalInput(at(today, 7)));
  const [err, setErr] = useState("");
  const minutes = (new Date(wake).getTime() - new Date(bed).getTime()) / 60_000;

  useEffect(() => {
    const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
    supabase.from("sleep").select("*").is("wake_at", null).gte("bed_at", since).order("bed_at", { ascending: false }).limit(1)
      .then(({ data }) => setOpen((data?.[0] as Sleep) ?? null));
  }, []);

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p;
    if (error) return setErr(error.message.includes("check") ? "Confira os horários." : error.message);
    onSaved();
  }

  return (
    <Sheet title="Sono" accent="sleep" onClose={onClose}>
      {open ? (
        <div className="sleep-now">
          <p className="lede">Dormindo desde <b>{fmtTime(open.bed_at)}</b></p>
          <button className="btn primary huge" onClick={() => run(supabase.from("sleep").update({ wake_at: new Date().toISOString() }).eq("id", open.id))}>
            Acordei
          </button>
        </div>
      ) : (
        <button className="btn ghost huge" onClick={() => run(supabase.from("sleep").insert({ bed_at: new Date().toISOString() }))}>
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
        <button className="btn primary" disabled={minutes <= 0}
          onClick={() => run(supabase.from("sleep").insert({ bed_at: fromLocalInput(bed), wake_at: fromLocalInput(wake) }))}>
          Salvar · {minutes > 0 ? fmtDuration(minutes) : "—"}
        </button>
      </div>
    </Sheet>
  );
}
