import { useEffect, useState } from "react";
import { Dial } from "@/components/Dial";
import { splitByDay, totals, useRange } from "@/lib/data";
import { dietWarnings, mealFor } from "@/lib/diet";
import { mealName } from "@/sheets/FoodSheet";
import { deleteDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref } from "firebase/storage";
import { row, storage, type Activity, type DietPlan, type Meal, type Profile, type Sleep, type Table, type Water } from "@/lib/firebase";
import { addDays, fmtDayLong, fmtDuration, fmtLiters, fmtNum, fmtTime, sameDay, startOfDay } from "@/lib/time";

/** Registro já salvo que volta para a folha correspondente para ser corrigido. */
export type EditTarget = { kind: "food"; rec: Meal } | { kind: "move"; rec: Activity } | { kind: "water"; rec: Water } | { kind: "sleep"; rec: Sleep };

type Entry = { id: string; table: Table; at: string; kind: EditTarget["kind"]; title: string; meta: string; meal?: Meal; edit: EditTarget };

const PLACE_LABEL = { casa: "em casa", restaurante: "restaurante", delivery: "delivery" } as const;

export default function Today({ profile, version, onChange, plan, onOpenDiet, onEdit }: {
  profile: Profile;
  version: number;
  onChange: () => void;
  plan: DietPlan | null;
  onOpenDiet: () => void;
  onEdit: (t: EditTarget) => void;
}) {
  const [day, setDay] = useState(() => startOfDay(new Date()));
  const [confirm, setConfirm] = useState<string | null>(null);
  const { data: raw, loading } = useRange(day, 1, version);
  const data = splitByDay(raw, day);
  const t = totals(data);
  const isToday = sameDay(day, new Date());
  const left = profile.kcal_goal - t.kcalIn + t.kcalOut;
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const photoKey = data.meals.map((m) => m.photo_path).filter(Boolean).join("|");
  const warnings = plan ? dietWarnings(plan, data.meals.flatMap((m) => m.items ?? [])) : [];
  const next = plan && isToday ? mealFor(plan, new Date(), mealName(new Date())) : null;
  const target = plan?.targets;

  useEffect(() => {
    const paths = photoKey ? photoKey.split("|") : [];
    if (!paths.length) return;
    Promise.all(paths.map((p) => getDownloadURL(ref(storage, p)).then((url) => [p, url] as const).catch(() => null))).then((urls) => {
      setPhotos(Object.fromEntries(urls.filter((u) => u !== null)));
    });
  }, [photoKey]);

  const entries: Entry[] = [
    ...data.meals.map((m) => ({
      id: m.id, table: "meals" as const, at: m.eaten_at, kind: "food" as const, title: m.description, meal: m, edit: { kind: "food" as const, rec: m },
      meta: [`${fmtNum(m.kcal)} kcal`, m.place && m.place !== "casa" ? PLACE_LABEL[m.place] : ""].filter(Boolean).join(" · "),
    })),
    ...data.activities.map((a) => ({ id: a.id, table: "activities" as const, at: a.started_at, kind: "move" as const, title: a.kind, meta: `${fmtDuration(a.duration_min)} · −${fmtNum(a.kcal)} kcal`, edit: { kind: "move" as const, rec: a } })),
    ...data.water.map((w) => ({ id: w.id, table: "water" as const, at: w.drank_at, kind: "water" as const, title: "Água", meta: `${fmtNum(w.ml)} ml`, edit: { kind: "water" as const, rec: w } })),
    ...data.sleep.map((s) => ({
      id: s.id, table: "sleep" as const, at: s.wake_at ?? s.bed_at, kind: "sleep" as const,
      title: s.wake_at ? `Sono · ${fmtTime(s.bed_at)}–${fmtTime(s.wake_at)}` : `Dormindo desde ${fmtTime(s.bed_at)}`,
      meta: s.wake_at ? fmtDuration((new Date(s.wake_at).getTime() - new Date(s.bed_at).getTime()) / 60_000) : "em curso",
      edit: { kind: "sleep" as const, rec: s },
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  async function remove(e: Entry) {
    await deleteDoc(row(e.table, e.id));
    if (e.meal?.photo_path) await deleteObject(ref(storage, e.meal.photo_path)).catch(() => {});
    setConfirm(null);
    onChange();
  }

  return (
    <main className="screen today">
      <header className="day-head">
        <button className="icon-btn" onClick={() => setDay(addDays(day, -1))} aria-label="Dia anterior">←</button>
        <div>
          <p className="eyebrow">{isToday ? "Hoje · " : ""}{day.toLocaleDateString("pt-BR", { weekday: "long" })}</p>
          <h1 className="day-title">{fmtDayLong(day)}</h1>
        </div>
        <button className="icon-btn" onClick={() => setDay(addDays(day, 1))} disabled={isToday} aria-label="Próximo dia">→</button>
      </header>

      <div className={loading ? "dial-wrap loading" : "dial-wrap"}>
        <Dial day={day} data={data} kcalGoal={profile.kcal_goal}>
          <span className="dc-num">{fmtNum(Math.abs(left))}</span>
          <span className="dc-label">{left >= 0 ? "kcal restantes" : "kcal acima"}</span>
        </Dial>
      </div>

      <section className="instruments">
        <Instrument kind="food" label="Comida" value={fmtNum(t.kcalIn)} unit="kcal" sub={`meta ${fmtNum(profile.kcal_goal)}`}
          frac={t.kcalIn / profile.kcal_goal} />
        <Instrument kind="move" label="Movimento" value={fmtNum(t.kcalOut)} unit="kcal" sub={t.activeMin ? fmtDuration(t.activeMin) : "—"}
          frac={t.activeMin / 30} />
        <Instrument kind="water" label="Água" value={fmtLiters(t.waterMl)} unit="L" sub={`de ${fmtLiters(profile.water_goal_ml)} L`}
          frac={t.waterMl / profile.water_goal_ml} />
        <Instrument kind="sleep" label="Sono" value={t.sleepMin ? fmtDuration(t.sleepMin) : "—"} unit="" sub={`meta ${fmtDuration(profile.sleep_goal_min)}`}
          frac={t.sleepMin / profile.sleep_goal_min} />
      </section>

      {t.kcalIn > 0 && (
        <section className="macros" aria-label="Macronutrientes">
          <Macro label="Proteína" g={t.protein} kcal={t.protein * 4} total={t.kcalIn} target={target?.protein_g} />
          <Macro label="Carboidrato" g={t.carbs} kcal={t.carbs * 4} total={t.kcalIn} target={target?.carbs_g} />
          <Macro label="Gordura" g={t.fat} kcal={t.fat * 9} total={t.kcalIn} target={target?.fat_g} />
        </section>
      )}

      {plan && (
        <section className="diet-today">
          <button className="diet-card" onClick={onOpenDiet}>
            <b>Dieta{next ? ` · ${next.name}` : ""}{next?.time ? ` às ${next.time}` : ""}</b>
            <small>{next ? next.options[0]?.items.map((it) => it.name).join(", ") : plan.title}</small>
          </button>
          {warnings.map((w, i) => (
            <p key={i} className="diet-warn">{w.text} <small>{w.items.join(", ")}</small></p>
          ))}
        </section>
      )}

      <section className="timeline">
        <h2 className="section-title">Registro</h2>
        {entries.length === 0 && !loading && (
          <p className="empty">{isToday ? "Nada por aqui ainda. Toque em + para começar o dia." : "Nenhum registro neste dia."}</p>
        )}
        <ol>
          {entries.map((e) => (
            <li key={e.id} className={`entry ${e.kind}`}>
              <time>{fmtTime(e.at)}</time>
              <span className="entry-dot" />
              <button className="entry-main" onClick={() => setConfirm(confirm === e.id ? null : e.id)}>
                <span className="entry-title">{e.title}</span>
                <span className="entry-meta">{e.meta}</span>
              </button>
              {e.meal?.photo_path && photos[e.meal.photo_path] && confirm !== e.id && (
                <img className="entry-thumb" src={photos[e.meal.photo_path]} alt="" />
              )}
              {confirm === e.id && (
                <span className="entry-actions">
                  <button className="btn small" onClick={() => { setConfirm(null); onEdit(e.edit); }}>Editar</button>
                  <button className="btn danger small" onClick={() => remove(e)}>Apagar</button>
                </span>
              )}
              {confirm === e.id && e.meal && (
                <div className="entry-detail">
                  {e.meal.photo_path && photos[e.meal.photo_path] && <img src={photos[e.meal.photo_path]} alt="Foto do prato" />}
                  {e.meal.items?.length ? (
                    <ul>
                      {e.meal.items.map((it, i) => (
                        <li key={i}><span>{it.name} <small>{it.quantity}</small></span><span>{fmtNum(it.kcal)}</span></li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function Instrument({ kind, label, value, unit, sub, frac }: { kind: string; label: string; value: string; unit: string; sub: string; frac: number }) {
  return (
    <div className={`instrument ${kind}`}>
      <span className="i-label">{label}</span>
      <span className="i-value">{value}<small>{unit}</small></span>
      <span className="i-bar"><span style={{ width: `${Math.min(Math.max(frac, 0), 1) * 100}%` }} /></span>
      <span className="i-sub">{sub}</span>
    </div>
  );
}

function Macro({ label, g, kcal, total, target }: { label: string; g: number; kcal: number; total: number; target?: number | null }) {
  return (
    <div className={target != null && g > target ? "macro over" : "macro"}>
      <span className="m-pct">{Math.round((kcal / Math.max(total, 1)) * 100)}%</span>
      <span className="m-label">{label}</span>
      <span className="m-g">{fmtNum(g)}{target != null ? ` / ${fmtNum(target)}` : ""} g</span>
    </div>
  );
}
