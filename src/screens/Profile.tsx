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
import { Sheet } from "@/components/Sheet";
import { HealthSheet } from "@/sheets/HealthSheet";
import BodyCompView from "@/screens/BodyCompView";
import { deltaText, useBodyComp } from "@/lib/bodycomp";
import { bodyCompDelta } from "@/lib/health";
import LabsView from "@/screens/LabsView";
import { outOfRangeCount, useLabReports } from "@/lib/labreports";
import { normalizeResult } from "@/lib/labs";
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
  const [body, setBody] = useState<"" | "view" | "add">("");
  const [bv, setBv] = useState(0);
  const { list: bodyList, err: bodyErr } = useBodyComp(version + bv);
  const [labs, setLabs] = useState<"" | "view" | "add">("");
  const [lv, setLv] = useState(0);
  const { list: labList, err: labErr } = useLabReports(version + lv);
  const [edit, setEdit] = useState(false);
  const closeEdit = useCallback(() => setEdit(false), []);
  const [healthOpen, setHealthOpen] = useState(false);
  const [hv, setHv] = useState(0);
  const { latest: anam, loaded: anamLoaded, error: anamErr } = useLatestAnamnesis(version + hv);
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

  const bodyAllowed = canUse(ent, "body_comp");
  if (body) {
    return (
      <BodyCompView profile={profile} list={bodyList} loadErr={bodyErr} measurements={list} allowed={bodyAllowed} startAdding={body === "add"}
        onPro={onPro} onBack={() => setBody("")} onChanged={() => { setBv((n) => n + 1); setMv((n) => n + 1); onSaved(); }} />
    );
  }

  const labsAllowed = canUse(ent, "labs");
  if (labs) {
    return (
      <LabsView profile={profile} list={labList} loadErr={labErr} allowed={labsAllowed} startAdding={labs === "add"}
        onPro={onPro} onBack={() => setLabs("")} onChanged={() => { setLv((n) => n + 1); onSaved(); }} />
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

  const bodyLast = bodyList[bodyList.length - 1];
  const bodyMuscle = bodyLast ? (bodyLast.muscle_kg ?? bodyLast.lean_kg) : null;
  const bodyDelta = bodyLast ? bodyCompDelta(bodyList, bodyLast.device) : null;

  const labLast = labList[labList.length - 1];
  const labOut = labLast ? outOfRangeCount(labLast) : 0;
  // Até três resultados do último laudo, só os que o Yune reconhece e com valor.
  const labBits = labLast
    ? labLast.results.filter((r) => normalizeResult(r)).slice(0, 3).map((r) => `${r.name} ${(normalizeResult(r)!.value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`)
    : [];

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
      <Card label="Composição corporal" action="+ enviar" locked={!bodyAllowed && !bodyList.length && !bodyErr}
        onOpen={() => (bodyAllowed ? setBody("add") : onPro())} onPro={onPro}>
        {bodyLast ? (
          <button className="pcard-body" onClick={() => setBody("view")}>
            <small>{bodyLast.device} · {new Date(bodyLast.measured_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</small>
            <div className="bc-summary">
              {bodyLast.fat_pct != null && <div><span className="big">{f1(bodyLast.fat_pct)}</span>%<small>gordura</small></div>}
              {bodyMuscle != null && <div><span className="big">{f1(bodyMuscle)}</span> kg<small>{bodyLast.muscle_kg != null ? "músculo" : "massa magra"}</small></div>}
              {bodyLast.visceral != null && <div><span className="big">{f1(bodyLast.visceral)}</span><small>visceral</small></div>}
            </div>
            {bodyDelta && deltaText(bodyDelta) && <small>Desde {new Date(bodyDelta.since).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}: <b>{deltaText(bodyDelta)}</b></small>}
          </button>
        ) : bodyErr ? null : (
          <p className="empty">Envie um laudo de bioimpedância</p>
        )}
        {bodyErr && <p className="note err">{bodyErr}</p>}
      </Card>
      <Card label="Exames" action="+ enviar" locked={!labsAllowed && !labList.length && !labErr}
        onOpen={() => (labsAllowed ? setLabs("add") : onPro())} onPro={onPro}>
        {labLast ? (
          <button className="pcard-body" onClick={() => setLabs("view")}>
            <div className="row sp">
              <span>Sangue · {new Date(labLast.collected_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}</span>
              {labOut > 0 && <span className="chip chip-static lab-out">{labOut} fora da referência do laboratório</span>}
            </div>
            {labBits.length > 0 && <small>{labBits.join(" · ")}</small>}
          </button>
        ) : labErr ? null : (
          <p className="empty">Envie um exame de sangue</p>
        )}
        {labErr && <p className="note err">{labErr}</p>}
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

      {healthOpen && anamErr && (
        <Sheet title="Sua saúde" onClose={closeHealth}>
          <p className="note err">Não foi possível carregar seu questionário. Para não sobrescrever suas respostas, ele não foi aberto.</p>
          <button className="btn primary" onClick={bumpHealth}>Tentar de novo</button>
        </Sheet>
      )}
      {healthOpen && anamLoaded && !anamErr && <HealthSheet profile={profile} initial={anam?.answers ?? {}} onClose={closeHealth} onSaved={bumpHealth} />}
      {edit && <ProfileEditSheet profile={profile} onClose={closeEdit} onSaved={() => { closeEdit(); onSaved(); }} />}
    </main>
  );
}
