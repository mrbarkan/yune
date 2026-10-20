import { useCallback, useState } from "react";
import { LineChart } from "@/components/LineChart";
import type { BodyComp, BodyCompValues, Measurement, Profile } from "@/lib/firebase";
import { bodyCompDelta } from "@/lib/health";
import { deleteBodyComp, deltaText, openHealthFile } from "@/lib/bodycomp";
import { BodyCompSheet } from "@/sheets/BodyCompSheet";

const num = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const day = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
export const devKey = (d: string) => d.toLowerCase().replace(/\s+/g, "");

type Series = { key: keyof BodyCompValues; label: string; unit: string; color: string };

export default function BodyCompView({ profile, list, measurements, allowed, startAdding, onPro, onBack, onChanged }: {
  profile: Profile; list: BodyComp[]; measurements: Measurement[]; allowed: boolean; startAdding?: boolean;
  onPro: () => void; onBack: () => void; onChanged: () => void;
}) {
  const [sheet, setSheet] = useState<{ rec?: BodyComp } | null>(startAdding && allowed ? {} : null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [warn, setWarn] = useState("");
  const [picked, setPicked] = useState("");
  const close = useCallback(() => setSheet(null), []);

  // Aparelhos presentes (nome da primeira leitura de cada um); leituras de aparelhos diferentes não se misturam.
  const devices: { key: string; name: string }[] = [];
  for (const r of list) if (!devices.some((d) => d.key === devKey(r.device))) devices.push({ key: devKey(r.device), name: r.device });
  const latest = list[list.length - 1];
  const current = devices.find((d) => d.key === picked)?.key ?? (latest ? devKey(latest.device) : "");
  const mine = list.filter((r) => devKey(r.device) === current);
  const delta = latest ? bodyCompDelta(list, mine[0]?.device ?? latest.device) : null;
  const muscleKey = delta?.muscle_field ?? (mine.some((r) => r.muscle_kg != null) ? "muscle_kg" : "lean_kg");

  const series: Series[] = [
    { key: "weight_kg", label: "Peso", unit: "kg", color: "var(--food)" },
    { key: "fat_pct", label: "Gordura", unit: "%", color: "var(--move)" },
    { key: "fat_kg", label: "Massa de gordura", unit: "kg", color: "var(--move)" },
    { key: muscleKey, label: muscleKey === "lean_kg" ? "Massa magra" : "Músculo", unit: "kg", color: "var(--water)" },
    { key: "visceral", label: "Gordura visceral", unit: "", color: "var(--sleep)" },
    { key: "bmr_kcal", label: "Taxa metabólica basal", unit: "kcal", color: "var(--ink)" },
    { key: "phase_angle", label: "Ângulo de fase", unit: "°", color: "var(--ink)" },
  ];

  function add(rec?: BodyComp) {
    if (!allowed) return onPro();
    setWarn("");
    setSheet({ rec });
  }

  async function open(path: string) {
    setErr("");
    try {
      await openHealthFile(path);
    } catch {
      setErr("Não foi possível abrir o arquivo.");
    }
  }

  async function remove(b: BodyComp) {
    setErr("");
    try {
      await deleteBodyComp(b);
      setConfirm(null);
    } catch {
      setErr("Não foi possível apagar.");
    }
    onChanged(); // atualiza em qualquer caso (o arquivo pode ter ido e o registro ficado)
  }

  return (
    <main className="screen settings">
      <header className="screen-head">
        <button className="link back" onClick={onBack}>‹ Perfil</button>
        <p className="eyebrow">{profile.name || "Você"}</p>
        <h1 className="day-title">Composição corporal</h1>
      </header>

      <button className="btn primary" onClick={() => add()}>+ Enviar laudo</button>
      {!allowed && <p className="note">Para enviar novos laudos, assine o Pro. Seus registros continuam aqui.</p>}
      {warn && <p className="note err">{warn}</p>}

      {devices.length > 1 && (
        <div className="chips" role="radiogroup" aria-label="Aparelho">
          {devices.map((d) => (
            <button key={d.key} role="radio" aria-checked={d.key === current} className={`chip${d.key === current ? " on" : ""}`}
              onClick={() => setPicked(d.key)}>{d.name}</button>
          ))}
        </div>
      )}

      {delta && deltaText(delta) && (
        <p className="note">Desde {day(delta.since)}: <b>{deltaText(delta)}</b></p>
      )}
      {devices.length > 0 && <p className="note small">Compare sempre no mesmo aparelho e nas mesmas condições (jejum, hidratação).</p>}

      {series.map((s) => {
        const points = mine.filter((r) => r[s.key] != null).map((r) => ({ t: r.measured_at, v: r[s.key] as number }));
        if (!points.length) return null;
        return (
          <section className="group" key={s.key}>
            <h2 className="section-title">{s.label} <span className="note">{num(points[points.length - 1].v)} {s.unit}</span></h2>
            <LineChart points={points} unit={s.unit} color={s.color} />
          </section>
        );
      })}

      <section className="group">
        <h2 className="section-title">Registros</h2>
        {!list.length && <p className="empty">Envie um laudo de bioimpedância</p>}
        {err && <p className="note err">{err}</p>}
        <ul className="meas-list">
          {[...list].reverse().map((b) => (
            <li key={b.id}>
              <div>
                <b>{b.device}</b>
                <small>
                  {[day(b.measured_at), b.weight_kg != null && `${num(b.weight_kg)} kg`, b.fat_pct != null && `${num(b.fat_pct)}% gordura`,
                    b.ai && "lido por IA"].filter(Boolean).join(" · ")}
                </small>
              </div>
              {confirm === b.id ? (
                <div className="meas-actions">
                  <button className="link" onClick={() => { setConfirm(null); setErr(""); }}>Manter</button>
                  <button className="link" onClick={() => remove(b)}>Apagar</button>
                </div>
              ) : (
                <div className="meas-actions">
                  {b.file_path && <button className="link" onClick={() => open(b.file_path!)}>Arquivo</button>}
                  <button className="link" onClick={() => add(b)}>Editar</button>
                  <button className="link" onClick={() => setConfirm(b.id)}>Apagar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      {sheet && (
        <BodyCompSheet profile={profile} all={measurements} rec={sheet.rec} onClose={close}
          onSaved={(w) => { close(); if (w) setWarn(w); onChanged(); }} />
      )}
    </main>
  );
}
