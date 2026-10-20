import { useEffect, useMemo, useRef, useState } from "react";
import { PrivateImage } from "@/components/PrivateImage";
import type { BodyPhoto, Measurement, Pose, Profile } from "@/lib/firebase";
import { compressImage } from "@/lib/image";
import { addBodyPhoto, deleteBodyPhoto, nearestMeasurement, sessions } from "@/lib/photos";
import { f1 } from "@/screens/MeasurementsView";

const POSES: { id: Pose; label: string }[] = [
  { id: "frente", label: "Frente" },
  { id: "lado", label: "Lado" },
  { id: "costas", label: "Costas" },
];

const fmtDay = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y.slice(2)}`;
};

const signed = (n: number, unit: string) => `${n < 0 ? "−" : "+"}${f1(Math.abs(n))} ${unit}`;

export default function PhotosView({ profile, photos, measurements, loadErr, onBack, onChanged }: {
  profile: Profile; photos: BodyPhoto[]; measurements: Measurement[]; loadErr: string;
  onBack: () => void; onChanged: () => void;
}) {
  const [pose, setPose] = useState<Pose>("frente");
  const [pending, setPending] = useState<{ file: File; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [compare, setCompare] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const all = useMemo(() => sessions(photos, profile.timezone), [photos, profile.timezone]);
  const withPose = all.filter((s) => s.photos[pose]);
  const previous = withPose[0]?.photos[pose];

  // Fecha o modo comparar se as sessões escolhidas deixarem de existir (ex.: foto apagada).
  useEffect(() => {
    setPicked((p) => p.filter((d) => all.some((s) => s.day === d && s.photos[pose])));
  }, [all, pose]);

  async function pick(file?: File) {
    if (!file) return;
    setErr("");
    try {
      const { preview } = await compressImage(file, 1600, 0.85);
      setPending({ file, preview });
    } catch {
      setErr("Não foi possível ler a foto.");
    }
  }

  async function save() {
    if (!pending) return;
    setBusy(true);
    setErr("");
    try {
      await addBodyPhoto(pose, pending.file, new Date());
    } catch {
      setErr("Não foi possível salvar a foto. Tente de novo.");
      setBusy(false);
      return;
    }
    setBusy(false);
    setPending(null);
    onChanged();
  }

  async function remove(p: BodyPhoto) {
    setErr("");
    try {
      await deleteBodyPhoto(p);
    } catch {
      setErr("Não foi possível apagar.");
      return;
    }
    setConfirm(null);
    onChanged();
  }

  function toggle(day: string) {
    setPicked((p) => (p.includes(day) ? p.filter((d) => d !== day) : p.length >= 2 ? [p[1], day] : [...p, day]));
  }

  const pair = picked.length === 2 ? [...picked].sort() : null;
  const delta = (key: "weight_kg" | "waist_cm", a: Measurement | null, b: Measurement | null) =>
    a && b && a[key] != null && b[key] != null ? (b[key] as number) - (a[key] as number) : null;
  const ma = pair ? nearestMeasurement(measurements, pair[0]) : null;
  const mb = pair ? nearestMeasurement(measurements, pair[1]) : null;
  const dWeight = delta("weight_kg", ma, mb);
  const dWaist = delta("waist_cm", ma, mb);

  return (
    <main className="screen settings">
      <header className="screen-head">
        <button className="link back" onClick={onBack}>‹ Perfil</button>
        <p className="eyebrow">{profile.name || "Você"}</p>
        <h1 className="day-title">Fotos de evolução</h1>
      </header>

      <p className="note photo-lock">Só você vê. O Yune não salva estas fotos na galeria nem cria links para elas.</p>

      <div className="segmented" role="tablist">
        {POSES.map((p) => (
          <button key={p.id} role="tab" aria-selected={pose === p.id} className={pose === p.id ? "on" : ""}
            onClick={() => { setPose(p.id); setPending(null); setConfirm(null); }}>{p.label}</button>
        ))}
      </div>

      <input ref={input} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />

      {pending ? (
        <section className="group">
          <div className="photo-frame">
            <img className="private-img" src={pending.preview} alt="Prévia da foto" draggable={false}
              onContextMenu={(e) => e.preventDefault()} />
            {previous && <PrivateImage className="photo-ghost" path={previous.path} alt="" />}
          </div>
          {previous && <p className="note">A foto anterior aparece por cima, esmaecida, para alinhar a pose.</p>}
          <div className="photo-actions">
            <button className="btn ghost" disabled={busy} onClick={() => setPending(null)}>Descartar</button>
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar"}</button>
          </div>
        </section>
      ) : (
        <button className="btn primary" onClick={() => input.current?.click()}>+ Tirar fotos de hoje</button>
      )}

      {(err || loadErr) && <p className="note err">{err || loadErr}</p>}

      {withPose.length > 1 && (
        <button className="link" onClick={() => { setCompare((c) => !c); setPicked([]); }}>
          {compare ? "Sair da comparação" : "Comparar dois dias"}
        </button>
      )}
      {compare && !pair && <p className="note">Escolha dois dias.</p>}

      {pair && (
        <section className="group">
          <div className="photo-pair">
            {pair.map((d) => (
              <figure key={d}>
                <PrivateImage path={all.find((s) => s.day === d)!.photos[pose]!.path} alt={`${POSES.find((p) => p.id === pose)!.label}, ${fmtDay(d)}`} />
                <figcaption>{fmtDay(d)}</figcaption>
              </figure>
            ))}
          </div>
          {(dWeight != null || dWaist != null) && (
            <p className="note">
              {[dWeight != null && `peso ${signed(dWeight, "kg")}`, dWaist != null && `cintura ${signed(dWaist, "cm")}`]
                .filter(Boolean).join(" · ")}
            </p>
          )}
        </section>
      )}

      <section className="group">
        <h2 className="section-title">Sessões</h2>
        {!withPose.length && <p className="empty">Nenhum registro</p>}
        <ul className="photo-grid">
          {withPose.map((s) => {
            const p = s.photos[pose]!;
            const on = picked.includes(s.day);
            return (
              <li key={s.day} className={on ? "on" : ""}>
                {compare ? (
                  <button className="photo-tile" aria-pressed={on} onClick={() => toggle(s.day)}>
                    <PrivateImage path={p.path} alt={`${fmtDay(s.day)}`} />
                  </button>
                ) : (
                  <div className="photo-tile"><PrivateImage path={p.path} alt={`${fmtDay(s.day)}`} /></div>
                )}
                <small>{fmtDay(s.day)}</small>
                {!compare && (confirm === p.id ? (
                  <div className="meas-actions">
                    <button className="link" onClick={() => setConfirm(null)}>Manter</button>
                    <button className="link" onClick={() => remove(p)}>Apagar</button>
                  </div>
                ) : (
                  <button className="link" onClick={() => setConfirm(p.id)}>Apagar</button>
                ))}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
