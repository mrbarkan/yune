import { useCallback, useState } from "react";
import { LineChart } from "@/components/LineChart";
import type { Measurement, Profile } from "@/lib/firebase";
import { bmi, waistHeight, waistHip } from "@/lib/health";
import { deleteMeasurement } from "@/lib/measurements";
import { MeasureSheet } from "@/sheets/MeasureSheet";

export const f1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

type Key = "weight_kg" | "waist_cm" | "hip_cm" | "neck_cm";
const SERIES: { key: Key; label: string; unit: string; color: string }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg", color: "var(--food)" },
  { key: "waist_cm", label: "Cintura", unit: "cm", color: "var(--move)" },
  { key: "hip_cm", label: "Quadril", unit: "cm", color: "var(--water)" },
  { key: "neck_cm", label: "Pescoço", unit: "cm", color: "var(--sleep)" },
];

export default function MeasurementsView({ profile, list, onBack, onChanged, startAdding }: {
  profile: Profile; list: Measurement[]; onBack: () => void; onChanged: () => void; startAdding?: boolean;
}) {
  const [sheet, setSheet] = useState<{ rec?: Measurement } | null>(startAdding ? {} : null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const close = useCallback(() => setSheet(null), []);

  const last = list[list.length - 1];
  const lastWith = (k: Key) => [...list].reverse().find((m) => m[k] != null);
  const waist = lastWith("waist_cm")?.waist_cm ?? null;
  const hip = lastWith("hip_cm")?.hip_cm ?? null;
  const imc = bmi(last?.weight_kg ?? null, profile.height_cm);
  const rcq = waistHip(waist, hip);
  const rce = waistHeight(waist, profile.height_cm);

  async function remove(id: string) {
    await deleteMeasurement(id).catch(() => {});
    setConfirm(null);
    onChanged();
  }

  return (
    <main className="screen settings">
      <header className="screen-head">
        <button className="link back" onClick={onBack}>‹ Perfil</button>
        <p className="eyebrow">{profile.name || "Você"}</p>
        <h1 className="day-title">Peso e medidas</h1>
      </header>

      <button className="btn primary" onClick={() => setSheet({})}>+ Medir</button>

      {(imc != null || rcq != null || rce != null) && (
        <section className="group">
          <div className="row three stats">
            {imc != null && <div><b>{f1(imc)}</b><small>IMC</small></div>}
            {rcq != null && <div><b>{f2(rcq)}</b><small>cintura/quadril</small></div>}
            {rce != null && <div><b>{f2(rce)}</b><small>cintura/altura</small></div>}
          </div>
        </section>
      )}

      {SERIES.map((s) => {
        const points = list.filter((m) => m[s.key] != null).map((m) => ({ t: m.measured_at, v: m[s.key] as number }));
        if (!points.length) return null;
        const cur = points[points.length - 1].v;
        return (
          <section className="group" key={s.key}>
            <h2 className="section-title">{s.label} <span className="note">{f1(cur)} {s.unit}</span></h2>
            <LineChart points={points} unit={s.unit} color={s.color} />
          </section>
        );
      })}

      <section className="group">
        <h2 className="section-title">Registros</h2>
        {!list.length && <p className="empty">Registre seu peso</p>}
        <ul className="meas-list">
          {[...list].reverse().map((m) => (
            <li key={m.id}>
              <div>
                <b>{f1(m.weight_kg)} kg</b>
                <small>
                  {day(m.measured_at)}
                  {[m.waist_cm != null && `cintura ${f1(m.waist_cm)}`, m.hip_cm != null && `quadril ${f1(m.hip_cm)}`, m.neck_cm != null && `pescoço ${f1(m.neck_cm)}`]
                    .filter(Boolean).map((t) => ` · ${t}`).join("")}
                  {m.source === "body_comp" && " · bioimpedância"}
                </small>
              </div>
              {confirm === m.id ? (
                <div className="meas-actions">
                  <button className="link" onClick={() => setConfirm(null)}>Manter</button>
                  <button className="link" onClick={() => remove(m.id)}>Apagar</button>
                </div>
              ) : (
                <div className="meas-actions">
                  <button className="link" onClick={() => setSheet({ rec: m })}>Editar</button>
                  <button className="link" onClick={() => setConfirm(m.id)}>Apagar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {sheet && (
        <MeasureSheet profile={profile} all={list} rec={sheet.rec} onClose={close}
          onSaved={() => { close(); onChanged(); }} />
      )}
    </main>
  );
}
