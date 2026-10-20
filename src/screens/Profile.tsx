import { useCallback, useState } from "react";
import { PrivateImage } from "@/components/PrivateImage";
import { canUse } from "@/lib/pro";
import type { DietPlan, Entitlements, Profile as ProfileData } from "@/lib/firebase";
import Settings from "@/screens/Settings";
import { ProfileEditSheet } from "@/sheets/ProfileEditSheet";

type DietProps = { allowed: boolean; plan: DietPlan | null; onOpen: () => void; onChanged: () => void };

type Props = {
  profile: ProfileData;
  ent: Entitlements;
  version: number;
  onSaved: () => void;
  onPro: () => void;
  diet: DietProps;
  /** Objetivo da pessoa (vem do questionário); sem ele o cabeçalho não mostra nada. */
  goal?: string;
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

export default function Profile({ profile, ent, onSaved, onPro, diet, goal }: Props) {
  const [settings, setSettings] = useState(false);
  const [edit, setEdit] = useState(false);
  const closeEdit = useCallback(() => setEdit(false), []);
  // Os cartões abrem os detalhes nas próximas tarefas.
  const soon = () => {};

  if (settings) {
    return <Settings profile={profile} onSaved={onSaved} diet={diet} onBack={() => setSettings(false)} />;
  }

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

      <Card label="Peso e medidas" action="+ medir" onOpen={soon}>
        <p className="empty">Registre seu peso</p>
      </Card>
      <Card label="Composição corporal" action="+ enviar" locked={!canUse(ent, "body_comp")} onOpen={soon} onPro={onPro}>
        <p className="empty">Envie um laudo de bioimpedância</p>
      </Card>
      <Card label="Exames" action="+ enviar" locked={!canUse(ent, "labs")} onOpen={soon} onPro={onPro}>
        <p className="empty">Envie um exame de sangue</p>
      </Card>
      <div className="pcard-pair">
        <Card label="Fotos" half onOpen={soon}>
          <p className="empty">Nenhum registro</p>
        </Card>
        <Card label="Sua saúde" half onOpen={soon}>
          <p className="empty">Conte sobre você</p>
        </Card>
      </div>

      {edit && <ProfileEditSheet profile={profile} onClose={closeEdit} onSaved={() => { closeEdit(); onSaved(); }} />}
    </main>
  );
}
