import { useCallback, useEffect, useRef, useState } from "react";
import { onIdTokenChanged, signOut, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useProfile } from "@/lib/data";
import { useDietPlan } from "@/lib/diet";
import { canUse, stripeActive, useEntitlements } from "@/lib/pro";
import { parseProReturn, withoutProParam } from "@/lib/proReturn";
import { shouldRefresh } from "@/lib/refresh";
import Auth from "@/screens/Auth";
import Today, { type EditTarget } from "@/screens/Today";
import Week from "@/screens/Week";
import Profile from "@/screens/Profile";
import { PrivateImage } from "@/components/PrivateImage";
import { FoodSheet } from "@/sheets/FoodSheet";
import { MoveSheet } from "@/sheets/MoveSheet";
import { WaterSheet } from "@/sheets/WaterSheet";
import { SleepSheet } from "@/sheets/SleepSheet";
import { DietSheet } from "@/sheets/DietSheet";
import { ProSheet } from "@/sheets/ProSheet";

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
  const { profile, reload, error: profileError } = useProfile(userId);
  const [tab, setTab] = useState<Tab>("today");
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [edit, setEdit] = useState<EditTarget | null>(null);
  const [version, setVersion] = useState(0);
  const lastLoad = useRef(Date.now());
  const bump = useCallback(() => {
    lastLoad.current = Date.now();
    setVersion((v) => v + 1);
  }, []);
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
  // Volta do Checkout: ok = espera o servidor liberar; cancel = só limpa a URL.
  const [proReturn, setProReturn] = useState(() => parseProReturn(location.search));
  const proLive = stripeActive(ent);
  useEffect(() => {
    if (proReturn === "cancel" || (proReturn === "ok" && proLive)) {
      history.replaceState(null, "", withoutProParam(location.href));
      setProReturn(null);
    }
  }, [proReturn, proLive]);
  const plan = useDietPlan(version);

  useEffect(() => {
    const refresh = () => document.visibilityState === "visible" && shouldRefresh(lastLoad.current, Date.now()) && bump();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [bump]);

  if (!profile) {
    if (!profileError) return <div className="boot" />;
    return (
      <main className="auth">
        <p className="note err">{profileError}</p>
        <button className="btn primary" onClick={reload}>Tentar de novo</button>
        <nav className="auth-switch"><button onClick={() => signOut(auth)}>Sair</button></nav>
      </main>
    );
  }

  return (
    <div className="app">
      {proReturn === "ok" && <p className="note ok pro-return" role="status">Assinatura recebida. O Pro libera em instantes.</p>}
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
      {sheet === "water" && <WaterSheet profile={profile} onClose={close} onSaved={bump} onProfile={reload} />}
      {sheet === "sleep" && <SleepSheet onClose={close} onSaved={saved} />}
      {edit?.kind === "food" && <FoodSheet profile={profile} plan={plan} dietOn={dietAllowed} meal={edit.rec} onClose={close} onSaved={saved} />}
      {edit?.kind === "move" && <MoveSheet profile={profile} activity={edit.rec} onClose={close} onSaved={saved} />}
      {edit?.kind === "water" && <WaterSheet profile={profile} water={edit.rec} onClose={close} onSaved={saved} onProfile={reload} />}
      {edit?.kind === "sleep" && <SleepSheet sleep={edit.rec} onClose={close} onSaved={saved} />}
      {sheet === "pro" && <ProSheet onClose={close} />}
      {sheet === "diet" && plan && <DietSheet plan={plan} onClose={close} />}
    </div>
  );
}
