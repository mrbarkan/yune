import { Dial } from "@/components/Dial";
import { splitByDay, totals, useRange } from "@/lib/data";
import type { Profile } from "@/lib/firebase";
import { addDays, fmtDuration, fmtLiters, fmtNum, fmtWeekday, startOfDay } from "@/lib/time";

export default function Week({ profile, version }: { profile: Profile; version: number }) {
  const today = startOfDay(new Date());
  const from = addDays(today, -6);
  const { data, loading } = useRange(from, 7, version);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const rows = days.map((d) => {
    const dd = splitByDay(data, d);
    return { day: d, data: dd, t: totals(dd) };
  });
  const logged = rows.filter((r) => r.t.kcalIn > 0);
  const avg = (f: (r: (typeof rows)[number]) => number, list = rows) => (list.length ? list.reduce((s, r) => s + f(r), 0) / list.length : 0);
  const slept = rows.filter((r) => r.t.sleepMin > 0);
  const max = Math.max(profile.kcal_goal * 1.3, ...rows.map((r) => r.t.kcalIn));

  return (
    <main className={loading ? "screen week loading" : "screen week"}>
      <header className="screen-head">
        <p className="eyebrow">Últimos 7 dias</p>
        <h1 className="day-title">A semana</h1>
      </header>

      <section className="small-multiples">
        {rows.map((r) => (
          <figure key={r.day.toISOString()}>
            <Dial day={r.day} data={r.data} kcalGoal={profile.kcal_goal} size={96} minimal />
            <figcaption>{fmtWeekday(r.day)} <b>{r.day.getDate()}</b></figcaption>
          </figure>
        ))}
      </section>

      <section className="bars" aria-label="Calorias por dia">
        <div className="bars-goal" style={{ bottom: `${(profile.kcal_goal / max) * 100}%` }}>
          <span>meta {fmtNum(profile.kcal_goal)}</span>
        </div>
        {rows.map((r) => (
          <div key={r.day.toISOString()} className="bar">
            <span className="bar-in" style={{ height: `${(r.t.kcalIn / max) * 100}%` }} title={`${fmtNum(r.t.kcalIn)} kcal`} />
            <span className="bar-out" style={{ height: `${(r.t.kcalOut / max) * 100}%` }} />
            <label>{fmtWeekday(r.day).slice(0, 1)}</label>
          </div>
        ))}
      </section>

      <section className="averages">
        <Avg label="Média ingerida" value={fmtNum(avg((r) => r.t.kcalIn, logged))} unit="kcal" kind="food" />
        <Avg label="Média gasta" value={fmtNum(avg((r) => r.t.kcalOut))} unit="kcal" kind="move" />
        <Avg label="Água por dia" value={fmtLiters(avg((r) => r.t.waterMl))} unit="L" kind="water" />
        <Avg label="Sono médio" value={slept.length ? fmtDuration(avg((r) => r.t.sleepMin, slept)) : "—"} unit="" kind="sleep" />
      </section>
    </main>
  );
}

function Avg({ label, value, unit, kind }: { label: string; value: string; unit: string; kind: string }) {
  return (
    <div className={`avg ${kind}`}>
      <span className="i-label">{label}</span>
      <span className="i-value">{value}<small>{unit}</small></span>
    </div>
  );
}
