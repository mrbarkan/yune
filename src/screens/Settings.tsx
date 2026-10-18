import { useEffect, useState } from "react";
import { Segmented } from "@/components/Sheet";
import { suggestedGoal } from "@/lib/activity";
import { disablePush, enablePush, isIOS, pushState, type PushState } from "@/lib/push";
import { supabase, type Profile, type Reminders } from "@/lib/supabase";
import { fmtNum } from "@/lib/time";

export default function Settings({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const [p, setP] = useState(profile);
  const [r, setR] = useState<Reminders | null>(null);
  const [push, setPush] = useState<PushState>("off");
  const [msg, setMsg] = useState("");
  const suggestion = suggestedGoal(p);

  useEffect(() => {
    supabase.from("reminders").select("*").eq("user_id", profile.id).single().then(({ data }) => setR(data as Reminders));
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, [profile.id]);

  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

  async function saveProfile() {
    const { id, ...rest } = p;
    const { error } = await supabase.from("profiles").update(rest).eq("id", id);
    setMsg(error ? error.message : "Salvo.");
    if (!error) onSaved();
  }

  async function saveReminders(next: Reminders) {
    setR(next);
    await supabase.from("reminders").update(next).eq("user_id", profile.id);
  }

  async function togglePush() {
    setMsg("");
    try {
      if (push === "on") await disablePush();
      else await enablePush();
      setPush(await pushState());
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <main className="screen settings">
      <header className="screen-head">
        <p className="eyebrow">{p.name || "Você"}</p>
        <h1 className="day-title">Ajustes</h1>
      </header>

      <section className="group">
        <h2 className="section-title">Corpo</h2>
        <label className="field"><span>Nome</span>
          <input value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <Segmented value={(p.sex ?? "") as "f" | "m" | ""} onChange={(v) => setP({ ...p, sex: (v || null) as Profile["sex"] })}
          options={[{ value: "f", label: "Feminino" }, { value: "m", label: "Masculino" }]} />
        <div className="row three">
          <label className="field"><span>Peso (kg)</span>
            <input inputMode="decimal" value={p.weight_kg ?? ""} onChange={(e) => setP({ ...p, weight_kg: num(e.target.value) })} /></label>
          <label className="field"><span>Altura (cm)</span>
            <input inputMode="numeric" value={p.height_cm ?? ""} onChange={(e) => setP({ ...p, height_cm: num(e.target.value) })} /></label>
          <label className="field"><span>Nascimento</span>
            <input inputMode="numeric" placeholder="ano" value={p.birth_year ?? ""} onChange={(e) => setP({ ...p, birth_year: num(e.target.value) })} /></label>
        </div>
      </section>

      <section className="group">
        <h2 className="section-title">Metas</h2>
        <div className="row three">
          <label className="field"><span>Calorias</span>
            <input inputMode="numeric" value={p.kcal_goal} onChange={(e) => setP({ ...p, kcal_goal: Number(e.target.value) || 0 })} /></label>
          <label className="field"><span>Água (ml)</span>
            <input inputMode="numeric" value={p.water_goal_ml} onChange={(e) => setP({ ...p, water_goal_ml: Number(e.target.value) || 0 })} /></label>
          <label className="field"><span>Sono (h)</span>
            <input inputMode="decimal" value={p.sleep_goal_min / 60} onChange={(e) => setP({ ...p, sleep_goal_min: Math.round((num(e.target.value) ?? 8) * 60) })} /></label>
        </div>
        {suggestion && suggestion !== p.kcal_goal && (
          <button className="link" onClick={() => setP({ ...p, kcal_goal: suggestion })}>
            Usar meta sugerida para manutenção: {fmtNum(suggestion)} kcal
          </button>
        )}
        <button className="btn primary" onClick={saveProfile}>Salvar</button>
        {msg && <p className="note">{msg}</p>}
      </section>

      <section className="group">
        <h2 className="section-title">Notificações</h2>
        {push === "needs-install" && (
          <div className="install-hint">
            <p>No iPhone, as notificações só funcionam com o Yune instalado na tela de início:</p>
            <ol>
              <li>Abra no <b>Safari</b> e toque em <b>Compartilhar</b> <span aria-hidden>⎋</span></li>
              <li>Escolha <b>Adicionar à Tela de Início</b></li>
              <li>Abra o Yune pelo ícone e volte aqui</li>
            </ol>
          </div>
        )}
        {push === "unsupported" && <p className="note">Este navegador não suporta notificações push.</p>}
        {push === "denied" && (
          <p className="note err">Notificações bloqueadas. Libere em {isIOS() ? "Ajustes › Notificações › Yune" : "configurações do site no navegador"}.</p>
        )}
        {(push === "on" || push === "off") && (
          <Toggle label="Receber notificações neste aparelho" on={push === "on"} onChange={togglePush} />
        )}

        {r && (
          <div className="reminders">
            <Toggle label="Lembrar de beber água" on={r.water_enabled} onChange={(v) => saveReminders({ ...r, water_enabled: v })} />
            {r.water_enabled && (
              <div className="row three">
                <label className="field"><span>A cada (min)</span>
                  <select value={r.water_every_min} onChange={(e) => saveReminders({ ...r, water_every_min: Number(e.target.value) })}>
                    {[60, 90, 120, 180].map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></label>
                <label className="field"><span>Das</span>
                  <input type="time" value={r.water_start.slice(0, 5)} onChange={(e) => saveReminders({ ...r, water_start: e.target.value })} /></label>
                <label className="field"><span>Até</span>
                  <input type="time" value={r.water_end.slice(0, 5)} onChange={(e) => saveReminders({ ...r, water_end: e.target.value })} /></label>
              </div>
            )}
            <Toggle label="Resumo do dia" on={r.summary_enabled} onChange={(v) => saveReminders({ ...r, summary_enabled: v })} />
            {r.summary_enabled && (
              <label className="field"><span>Horário do resumo</span>
                <input type="time" value={r.summary_time.slice(0, 5)} onChange={(e) => saveReminders({ ...r, summary_time: e.target.value })} /></label>
            )}
            <Toggle label="Hora de dormir" on={r.bedtime_enabled} onChange={(v) => saveReminders({ ...r, bedtime_enabled: v })} />
            {r.bedtime_enabled && (
              <label className="field"><span>Lembrar às</span>
                <input type="time" value={r.bedtime_time.slice(0, 5)} onChange={(e) => saveReminders({ ...r, bedtime_time: e.target.value })} /></label>
            )}
          </div>
        )}
      </section>

      <section className="group">
        <button className="btn ghost" onClick={() => supabase.auth.signOut()}>Sair</button>
        <p className="colophon">Yune · estimativas de calorias são aproximadas e não substituem orientação profissional.</p>
      </section>
    </main>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden />
    </label>
  );
}
