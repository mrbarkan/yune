import { useEffect, useState } from "react";
import { deleteDoc } from "firebase/firestore";
import { Sheet } from "@/components/Sheet";
import { UndoToast } from "@/components/UndoToast";
import { row, type Profile } from "@/lib/firebase";
import { midpoint } from "@/lib/gaps";
import { loadHistory, loadRecipes, logChip } from "@/lib/quickLog";
import { snackOptions, type QuickChip } from "@/lib/review";
import { fmtNum, fmtTime, fromLocalInput, toLocalInput } from "@/lib/time";

export const chipLabel = (s: string) => (s.length > 30 ? s.slice(0, 28) + "…" : s);

/** "Beliscou algo?": um toque registra um lanche de costume no meio do intervalo [from, to]. */
export function SnackSheet({ from, to, onClose, onLogged, onOther }: {
  profile: Profile;
  from: string;
  to: string;
  onClose: () => void;
  /** Recarrega Hoje sem fechar a folha (o Desfazer continua na tela). */
  onLogged: () => void;
  /** "Outro…": a folha de comida no horário escolhido. */
  onOther: (at: Date) => void;
}) {
  const [at, setAt] = useState(() => toLocalInput(new Date(midpoint(from, to))));
  const [chips, setChips] = useState<QuickChip[]>([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([loadHistory(), loadRecipes()]).then(
      ([history, recipes]) => alive && setChips(snackOptions(history, recipes)),
      () => alive && setErr("Não foi possível carregar seus lanches."),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function log(c: QuickChip) {
    setBusy(true);
    setErr("");
    try {
      setToast(await logChip(c, fromLocalInput(at)));
      navigator.vibrate?.(8);
      onLogged();
    } catch {
      setErr("Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string) {
    setToast(null);
    try {
      await deleteDoc(row("meals", id));
      onLogged();
    } catch {
      setErr("Não foi possível desfazer.");
    }
  }

  return (
    <Sheet title="Beliscou algo?" accent="food" onClose={onClose}>
      <p className="eyebrow">entre {fmtTime(from)} e {fmtTime(to)}</p>
      <label className="time-pill snack-time">
        <span>{fmtTime(new Date(at))}</span>
        <input type="datetime-local" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} aria-label="Horário" />
      </label>
      <div className="chips">
        {chips.map((c) => (
          <button key={c.key} className="chip" disabled={busy} onClick={() => log(c)}>
            {chipLabel(c.label)} <em>{fmtNum(c.kcal)}</em>
          </button>
        ))}
        <button className="chip" onClick={() => onOther(new Date(fromLocalInput(at)))}>Outro…</button>
        <button className="chip" onClick={onClose}>Nada</button>
      </div>
      {err && <p className="note err">{err}</p>}
      {toast && <UndoToast key={toast} onUndo={() => undo(toast)} onExpire={onClose} />}
    </Sheet>
  );
}
