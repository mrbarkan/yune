import { useCallback, useEffect, useState } from "react";
import { onIdTokenChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { splitByDay, totals, useProfile, useRange } from "@/lib/data";
import { startOfDay } from "@/lib/time";
import Auth from "@/screens/Auth";
import Today from "@/screens/Today";
import Week from "@/screens/Week";
import Settings from "@/screens/Settings";
import { FoodSheet } from "@/sheets/FoodSheet";
import { MoveSheet } from "@/sheets/MoveSheet";
import { WaterSheet } from "@/sheets/WaterSheet";
import { SleepSheet } from "@/sheets/SleepSheet";

type Tab = "today" | "week" | "settings";
type SheetKind = "menu" | "food" | "move" | "water" | "sleep" | null;

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
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const close = useCallback(() => setSheet(null), []);
  const saved = useCallback(() => {
    bump();
    setSheet(null);
  }, [bump]);

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
      {tab === "today" && <Today profile={profile} version={version} onChange={bump} />}
      {tab === "week" && <Week profile={profile} version={version} />}
      {tab === "settings" && <Settings profile={profile} onSaved={() => { reload(); bump(); }} />}

      <nav className="tabbar" aria-label="Navegação">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>Hoje</button>
        <button className="fab" aria-label="Registrar" onClick={() => setSheet(sheet === "menu" ? null : "menu")}>
          <span className={sheet === "menu" ? "plus open" : "plus"} />
        </button>
        <button className={tab === "week" ? "on" : ""} onClick={() => setTab("week")}>Semana</button>
        <button className={tab === "settings" ? "on gear" : "gear"} onClick={() => setTab("settings")} aria-label="Ajustes">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><circle cx="12" cy="12" r="3.2" /><circle cx="12" cy="12" r="8.5" strokeDasharray="2.6 2.1" /></svg>
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
      {sheet === "food" && <FoodSheet profile={profile} onClose={close} onSaved={saved} />}
      {sheet === "move" && <MoveSheet profile={profile} onClose={close} onSaved={saved} />}
      {sheet === "water" && <WaterSheet profile={profile} todayMl={todayMl} onClose={close} onSaved={bump} />}
      {sheet === "sleep" && <SleepSheet onClose={close} onSaved={saved} />}
    </div>
  );
}
