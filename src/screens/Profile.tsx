import { useCallback, useState } from "react";
import { PrivateImage } from "@/components/PrivateImage";
import { canUse } from "@/lib/pro";
import type { DietPlan, Entitlements, Profile as ProfileData } from "@/lib/firebase";
import { LineChart } from "@/components/LineChart";
import { bmi, waistHeight } from "@/lib/health";
import { changeSince, useMeasurements } from "@/lib/measurements";
import MeasurementsView, { f1 } from "@/screens/MeasurementsView";
import PhotosView from "@/screens/PhotosView";
import { sessions, useBodyPhotos } from "@/lib/photos";
import Settings from "@/screens/Settings";
import { ProfileEditSheet } from "@/sheets/ProfileEditSheet";
import { HealthSheet } from "@/sheets/HealthSheet";
import { completion, useLatestAnamnesis } from "@/lib/anamnesis";

type DietProps = { allowed: boolean; plan: DietPlan | null; onOpen: () => void; onChanged: () => void };

type Props = {
  profile: ProfileData;
  ent: Entitlements;
  version: number;
  onSaved: () => void;
  onPro: () => void;
  diet: DietProps;
};

export function initial(name: string | null) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

/** Casca comum dos cartões: rótulo, ação opcional e, se for Pro sem acesso, o convite. */
export function Card({ label, action, locked, onOpen, onPro, half, children }: {
  label: string;
  action?: string;
  locked?: boolean;
  onOpen: () => void;
  onPro?: () => void;
  half?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`pcard${half ? " half" : ""}`}>
      <header>
        <h2 className="section-title">{label}{locked && <span className="pro-badge">Pro</span>}</h2>
        {action && !locked && <button className="link" onClick={onOpen}>{action}</button>}
      </header>
      {children}
      {locked && <button className="link" onClick={onPro}>Conhecer o Pro</button>}
    </section>
  );
}

export default function Profile({ profile, ent, version, onSaved, onPro, diet }: Props) {
  const [settings, setSettings] = useState(false);
  const [meas, setMeas] = useState<"" | "view" | "add">("");
  const [mv, setMv] = useState(0);
  const list = useMeasurements(version + mv);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [pv, setPv] = useState(0);
  const photos = useBodyPhotos(version + pv);
  const [edit, setEdit] = useState(false);
  const closeEdit = useCallback(() => setEdit(false), []);
  const [healthOpen, setHealthOpen] = useState(false);
  const [hv, setHv] = useState(0);
  const { latest: anam, loaded: anamLoaded } = useLatestAnamnesis(version + hv);
  const closeHealth = useCallback(() => setHealthOpen(false), []);
  const bumpHealth = useCallback(() => setHv((n) => n + 1), []);
  const goalAnswer = anam?.answers.objetivo?.principal;
  const goal = typeof goalAnswer === "string" && goalAnswer.trim() ? goalAnswer.trim().toLowerCase() : undefined;
  const healthPct = anam ? completion(anam.answers, profile) : 0;
  // Os demais cartões abrem os detalhes nas próximas tarefas.
  const soon = () => {};

  if (settings) {
    return <Settings profile={profile} onSaved={onSaved} diet={diet} onBack={() => setSettings(false)} />;
  }

  if (meas) {
    return (
      <MeasurementsView profile={profile} list={list} startAdding={meas === "add"} onBack={() => setMeas("")}
        onChanged={() => { setMv((n) => n + 1); onSaved(); }} />
    );
  }

  if (photosOpen) {
    return (
      <PhotosView profile={profile} photos={photos.list} measurements={list} loadErr={photos.err}
        onBack={() => setPhotosOpen(false)} onChanged={() => setPv((n) => n + 1)} />
    );
  }

  const last = list[list.length - 1];
  const change = changeSince(list);
  const lastWaist = [...list].reverse().find((m) => m.waist_cm != null)?.waist_cm ?? null;
  const imc = bmi(last?.weight_kg ?? null, profile.height_cm);
  const rce = waistHeight(lastWaist, profile.height_cm);
  const f2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const weeks = change ? Math.round(change.days / 7) : 0;

  const age = profile.birth_year ? new Date().getFullYear() - profile.birth_year : null;
  const bits = [
    age != null && `${age} anos`,
    profile.height_cm != null && `${(profile.height_cm / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`,
    goal && `objetivo: ${goal}`,
  ].filter(Boolean);

  return (
    <main className="screen profile">
      <div className="profile-top">
        <p className="eyebrow">Perfil</p>
        <button className="link" onClick={() => setSettings(true)}>Ajustes</button>
      </div>

      <header className="profile-head">
        <button className="avatar" onClick={() => setEdit(true)} aria-label="Editar perfil">
          {profile.photo_path ? <PrivateImage path={profile.photo_path} alt="" /> : <span>{initial(profile.name)}</span>}
        </button>
        <div>
          <h1 className="profile-name">{profile.name || "Você"}</h1>
          <p className="note">{bits.length ? bits.join(" · ") : "Complete seu perfil"}</p>
        </div>
      </header>

      <Card label="Peso e medidas" action="+ medir" onOpen={() => setMeas("add")}>
        {last ? (
          <button className="pcard-body" onClick={() => setMeas("view")}>
            <div className="pcard-split">
              <div>
                <span className="big">{f1(last.weight_kg)}</span> kg
                {change && <small>{change.delta < 0 ? "−" : "+"}{f1(Math.abs(change.delta))} kg em {weeks} semanas</small>}
              </div>
              <div className="right">
                {lastWaist != null && <div>cintura {f1(lastWaist)} cm</div>}
                {(imc != null || rce != null) && (
                  <small>{[imc != null && `IMC ${f1(imc)}`, rce != null && `RCE ${f2(rce)}`].filter(Boolean).join(" · ")}</small>
                )}
              </div>
            </div>
            {list.length > 1 && <LineChart compact unit="kg" color="var(--ink)" points={list.map((m) => ({ t: m.measured_at, v: m.weight_kg }))} />}
          </button>
        ) : (
          <p className="empty">Registre seu peso</p>
        )}
      </Card>
      <Card label="Composição corporal" action="+ enviar" locked={!canUse(ent, "body_comp")} onOpen={soon} onPro={onPro}>
        <p className="empty">Envie um laudo de bioimpedância</p>
      </Card>
      <Card label="Exames" action="+ enviar" locked={!canUse(ent, "labs")} onOpen={soon} onPro={onPro}>
        <p className="empty">Envie um exame de sangue</p>
      </Card>
      <div className="pcard-pair">
        <Card label="Fotos" half onOpen={() => setPhotosOpen(true)}>
          <button className="pcard-body" onClick={() => setPhotosOpen(true)}>
            <p className="empty">
              {photos.list.length ? `${sessions(photos.list, profile.timezone).length} sessões` : "Nenhum registro"} <span aria-hidden>🔒</span>
            </p>
          </button>
        </Card>
        <Card label="Sua saúde" half onOpen={() => setHealthOpen(true)}>
          <button className="pcard-body" onClick={() => setHealthOpen(true)}>
            <p className="empty">{anam ? `${healthPct}% preenchido` : "Conte sobre você"}</p>
          </button>
        </Card>
      </div>

      {healthOpen && anamLoaded && <HealthSheet profile={profile} initial={anam?.answers ?? {}} onClose={closeHealth} onSaved={bumpHealth} />}
      {edit && <ProfileEditSheet profile={profile} onClose={closeEdit} onSaved={() => { closeEdit(); onSaved(); }} />}
    </main>
  );
}
