import { useCallback, useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { splitByDay, totals, useProfile, useRange } from "@/lib/data";
import { useDietPlan } from "@/lib/diet";
import { canUse, useEntitlements } from "@/lib/pro";
import { startOfDay } from "@/lib/time";
import Auth from "@/screens/Auth";
import Today, { type EditTarget } from "@/screens/Today";
import Week from "@/screens/Week";
import Profile from "@/screens/Profile";
import { PrivateImage } from "@/components/PrivateImage";
import { Sheet } from "@/components/Sheet";
import { FoodSheet } from "@/sheets/FoodSheet";
import { MoveSheet } from "@/sheets/MoveSheet";
import { WaterSheet } from "@/sheets/WaterSheet";
import { SleepSheet } from "@/sheets/SleepSheet";
import { DietSheet } from "@/sheets/DietSheet";

type Tab = "today" | "week" | "profile";
type SheetKind = "menu" | "food" | "move" | "water" | "sleep" | "diet" | "pro" | null;

export default function App() {
  // Envolto num objeto: depois de confirmar o e-mail o Firebase devolve o mesmo User, só com token novo.
  const [state, setState] = useState<{ user: User | null }>();

  useEffect(() => onIdTokenChanged(auth, (user) => setState({ user })), []);

  if (!state) return <div className="boot" />;
  const { user } = state;
  // Só entra quem confirmou o e-mail (as regras do Firestore exigem o mesmo).
  if (!user || !user.emailVerified) return <Auth user={user} />;
  return <Shell userId={user.uid} />;
}

function Shell({ userId }: { userId: string }) {
  const { profile, reload } = useProfile(userId);
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const close = useCallback(() => {
    setSheet(null);
    setEdit(null);
  }, []);
  const saved = useCallback(() => {
    bump();
    close();
  }, [bump, close]);

  const ent = useEntitlements(userId);
  const dietAllowed = canUse(ent, "diet");
  const plan = useDietPlan(version);
  const { data: today } = useRange(startOfDay(new Date()), 1, version);
  const todayMl = totals(splitByDay(today, new Date())).waterMl;

  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && bump();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [bump]);

  if (!profile) return <div className="boot" />;

  return (
    <div className="app">
      {tab === "today" && <Today profile={profile} version={version} onChange={bump} plan={plan} dietOn={dietAllowed} onOpenDiet={() => setSheet("diet")}
        onEdit={setEdit} />}
      {tab === "week" && <Week profile={profile} version={version} />}
      {tab === "profile" && (
        <Profile profile={profile} ent={ent} version={version} onSaved={() => { reload(); bump(); }} onPro={() => setSheet("pro")}
          diet={{ allowed: dietAllowed, plan, onOpen: () => setSheet("diet"), onChanged: bump }} />
      )}

      <nav className="tabbar" aria-label="Navegação">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>Hoje</button>
        <button className="fab" aria-label="Registrar" onClick={() => setSheet(sheet === "menu" ? null : "menu")}>
          <span className={sheet === "menu" ? "plus open" : "plus"} />
        </button>
        <button className={tab === "week" ? "on" : ""} onClick={() => setTab("week")}>Semana</button>
        <button className={tab === "profile" ? "on avatar-tab" : "avatar-tab"} onClick={() => setTab("profile")} aria-label="Perfil">
          <span className="avatar mini" aria-hidden>
            {profile.photo_path ? <PrivateImage path={profile.photo_path} alt="" /> : <span>{(profile.name || "?").trim().charAt(0).toUpperCase()}</span>}
          </span>
        </button>
      </nav>

      {sheet === "menu" && (
        <div className="quick" onClick={close}>
          <div className="quick-grid" onClick={(e) => e.stopPropagation()}>
            {([
              ["food", "Comida", "o que comi"],
              ["move", "Movimento", "o que fiz"],
              ["water", "Água", "um copo"],
              ["sleep", "Sono", "dormir · acordar"],
            ] as const).map(([k, label, hint], i) => (
              <button key={k} className={`quick-item ${k}`} style={{ animationDelay: `${i * 35}ms` }} onClick={() => setSheet(k)}>
                <i />
                <b>{label}</b>
                <small>{hint}</small>
              </button>
            ))}
          </div>
        </div>
      )}
      {sheet === "food" && <FoodSheet profile={profile} plan={plan} dietOn={dietAllowed} onClose={close} onSaved={saved} />}
      {sheet === "move" && <MoveSheet profile={profile} onClose={close} onSaved={saved} />}
      {sheet === "water" && <WaterSheet profile={profile} todayMl={todayMl} onClose={close} onSaved={bump} onProfile={reload} />}
      {sheet === "sleep" && <SleepSheet onClose={close} onSaved={saved} />}
      {edit?.kind === "food" && <FoodSheet profile={profile} plan={plan} dietOn={dietAllowed} meal={edit.rec} onClose={close} onSaved={saved} />}
      {edit?.kind === "move" && <MoveSheet profile={profile} activity={edit.rec} onClose={close} onSaved={saved} />}
      {edit?.kind === "water" && <WaterSheet profile={profile} todayMl={todayMl} water={edit.rec} onClose={close} onSaved={saved} onProfile={reload} />}
      {edit?.kind === "sleep" && <SleepSheet sleep={edit.rec} onClose={close} onSaved={saved} />}
      {sheet === "pro" && <Sheet title="Yune Pro" onClose={close}><p className="note">Em breve: exames, composição corporal e dieta prescrita.</p></Sheet>}
      {sheet === "diet" && plan && <DietSheet plan={plan} onClose={close} />}
    </div>
  );
}
