import { useEffect, useMemo, useState } from "react";
import { addDoc, deleteDoc, getDoc } from "firebase/firestore";
import { Sheet } from "@/components/Sheet";
import { UndoToast } from "@/components/UndoToast";
import { loadRange, splitByDay, totals, type DayData } from "@/lib/data";
import { DEFAULT_REMINDERS } from "@/lib/defaults";
import { remindersDoc, row, table, type Meal, type Profile, type Recipe, type Reminders } from "@/lib/firebase";
import { fluidLabel } from "@/lib/fluids";
import { slotChips } from "@/lib/gaps";
import { closeInReview, loadHistory, loadRecipes, loadReview, logChip, openInReview } from "@/lib/quickLog";
import { answeredKeys, askAt, chipLabel, mealChip, pendingReview, reviewRows, snackOptions, type PendingReview, type QuickChip, type ReviewAsk } from "@/lib/review";
import { addDays, backfillAt, dayId, fmtDayLong, fmtNum, fmtTime, startOfDay } from "@/lib/time";
import { containersOf } from "@/lib/waterView";

/** Fechar o dia `day`: o que foi registrado, refeições principais e intervalos ainda em aberto, e água. Tudo opcional. */
export function CloseDaySheet({ profile, day, onClose, onLogged, onOther }: {
  profile: Profile;
  day: Date;
  onClose: () => void;
  /** Recarrega Hoje sem fechar a folha (o Desfazer continua na tela). */
  onLogged: () => void;
  /** "Outro…": a folha de comida no horário da pergunta; ao salvar, `review` fecha a pergunta. */
  onOther: (at: Date, review: PendingReview) => void;
}) {
  const id = dayId(day);
  const [data, setData] = useState<DayData | null>(null);
  const [closed, setClosed] = useState<string[] | null>(null);
  const [win, setWin] = useState<{ start: string; end: string } | null>(null);
  const [history, setHistory] = useState<Meal[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [version, setVersion] = useState(0);
  const [loadErr, setLoadErr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ id: string; keys: string[] } | null>(null);
  const refresh = () => {
    setVersion((v) => v + 1);
    onLogged();
  };

  useEffect(() => {
    let alive = true;
    // Sem a revisão, o que já foi respondido voltaria: as perguntas só aparecem com ela carregada.
    loadReview(id).then((c) => alive && setClosed(c), () => alive && setLoadErr("Não foi possível carregar este dia."));
    // Janela acordada dos lembretes; sem eles, a padrão.
    const pick = (r?: Partial<Reminders>) => alive && setWin({ start: r?.water_start ?? DEFAULT_REMINDERS.water_start, end: r?.water_end ?? DEFAULT_REMINDERS.water_end });
    getDoc(remindersDoc(profile.id)).then((snap) => pick(snap.data() as Partial<Reminders> | undefined), () => pick());
    Promise.all([loadHistory(), loadRecipes()]).then(([h, r]) => {
      if (!alive) return;
      setHistory(h);
      setRecipes(r);
    }, () => alive && setErr("Não foi possível carregar seus atalhos."));
    return () => {
      alive = false;
    };
  }, [id, profile.id]);

  useEffect(() => {
    let alive = true;
    loadRange(startOfDay(day), addDays(day, 1)).then(
      (d) => alive && setData(splitByDay(d, day)),
      // Falha ao atualizar depois de um registro: o dia já carregado continua na tela.
      () => alive && (version ? setErr("Não foi possível atualizar o dia.") : setLoadErr("Não foi possível carregar este dia.")),
    );
    return () => {
      alive = false;
    };
  }, [id, version]);

  const snacks = useMemo(() => snackOptions(history, recipes), [history, recipes]);
  const now = new Date();
  const rows = data && closed && win ? reviewRows(data.meals, day, now, win, closed) : null;
  const t = data ? totals(data) : null;

  async function log(r: ReviewAsk, c: QuickChip) {
    setBusy(true);
    setErr("");
    const at = askAt(r);
    // No intervalo, a metade depois do registro também fica respondida (senão uma resposta abriria outra pergunta).
    const keys = answeredKeys(r, at);
    let mealId: string;
    try {
      mealId = await logChip(c, at);
    } catch {
      setBusy(false);
      return setErr("Não foi possível salvar.");
    }
    navigator.vibrate?.(8);
    try {
      await closeInReview(id, ...keys);
      setClosed((k) => [...(k ?? []), ...keys]);
    } catch {
      setErr("Registrado, mas não foi possível marcar como respondido.");
    }
    setToast({ id: mealId, keys });
    refresh();
    setBusy(false);
  }

  async function undo({ id: mealId, keys }: { id: string; keys: string[] }) {
    setToast(null);
    setErr("");
    try {
      await deleteDoc(row("meals", mealId));
    } catch {
      return setErr("Não foi possível desfazer.");
    }
    refresh();
    try {
      await openInReview(id, ...keys);
      setClosed((k) => (k ?? []).filter((x) => !keys.includes(x)));
    } catch {
      setErr("Refeição apagada, mas a pergunta não voltou.");
    }
  }

  async function nothing(key: string) {
    setBusy(true);
    setErr("");
    try {
      await closeInReview(id, key);
      setClosed((k) => [...(k ?? []), key]);
    } catch {
      setErr("Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }

  async function addWater(ml: number) {
    setErr("");
    const at = new Date();
    try {
      await addDoc(table("water"), { ml, drank_at: backfillAt(day, at).toISOString(), created_at: at.toISOString() });
    } catch {
      return setErr("Não foi possível salvar.");
    }
    navigator.vibrate?.(8);
    refresh();
  }

  const asks = rows?.filter((r): r is ReviewAsk => r.kind !== "meal") ?? [];

  return (
    <Sheet title="Fechar o dia" onClose={onClose}>
      <p className="eyebrow">{fmtDayLong(day)}</p>
      {loadErr ? (
        <p className="note err">{loadErr}</p>
      ) : !rows ? (
        <p className="note">Carregando…</p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="review">
              {rows.map((r) => r.kind === "meal" ? (
                <li key={r.key} className="review-meal">
                  <time>{fmtTime(r.at)}</time>
                  <span>{r.meal.description}</span>
                  <em>{fmtNum(r.meal.kcal)} kcal</em>
                </li>
              ) : (
                <li key={r.key} className="review-ask">
                  {r.kind === "slot" ? <time>{fmtTime(r.at)}</time> : <span />}
                  <div>
                    <p>{r.kind === "slot" ? `${r.slot.slot}?` : `Nada entre ${fmtTime(r.gap.from)} e ${fmtTime(r.gap.to)}. Beliscou algo?`}</p>
                    <div className="chips">
                      {(r.kind === "slot" ? slotChips(history, r.slot.slot).map(mealChip) : snacks).map((c) => (
                        <button key={c.key} className="chip" disabled={busy} onClick={() => log(r, c)}>
                          {chipLabel(c.label)} <em>{fmtNum(c.kcal)}</em>
                        </button>
                      ))}
                      <button className="chip" disabled={busy} onClick={() => onOther(new Date(askAt(r)), pendingReview(id, r))}>Outro…</button>
                      <button className="chip" disabled={busy} onClick={() => nothing(r.key)}>Nada</button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {asks.length === 0 && <p className="note">Nada pendente neste dia.</p>}
        </>
      )}

      <div>
        <p className="eyebrow">Água</p>
        <div className="containers">
          {containersOf(profile).map((c, i) => (
            <div key={i} className="container">
              <button className="btn ghost" onClick={() => addWater(c.ml)} aria-label={`${c.name}: mais ${fmtNum(c.ml)} ml`}>
                <span>{c.name}</span><small>+{fmtNum(c.ml)} ml</small>
              </button>
            </div>
          ))}
        </div>
      </div>
      {t && <p className="note">{fluidLabel(t.fluidMl, t.waterMl)}</p>}

      {err && <p className="note err">{err}</p>}
      {/* Antes do Pronto: o aviso fica preso ao pé da folha e, depois dele, cobriria o botão. */}
      {toast && <UndoToast key={toast.id} onUndo={() => undo(toast)} onExpire={() => setToast(null)} />}
      <div className="actions">
        <button className="btn primary" onClick={onClose}>Pronto</button>
      </div>
    </Sheet>
  );
}
