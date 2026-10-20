import { useCallback, useEffect, useRef, useState } from "react";
import { Segmented } from "@/components/Sheet";
import { AboutSheet } from "@/sheets/AboutSheet";
import { suggestedGoal } from "@/lib/activity";
import { disablePush, enablePush, isIOS, pushState, type PushState } from "@/lib/push";
import { signOut } from "firebase/auth";
import { deleteDoc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { compressImage } from "@/lib/image";
import {
  auth, DEFAULT_REMINDERS, importDietPlan, profileDoc, remindersDoc, row, storage, type DietPlan, type Profile, type Reminders,
} from "@/lib/firebase";
import { fmtLiters, fmtNum } from "@/lib/time";

type DietProps = { allowed: boolean; plan: DietPlan | null; onOpen: () => void; onChanged: () => void };

export default function Settings({ profile, onSaved, diet, onBack }: { profile: Profile; onSaved: () => void; diet: DietProps; onBack: () => void }) {
  const [p, setP] = useState(profile);
  const [r, setR] = useState<Reminders | null>(null);
  const [push, setPush] = useState<PushState>("off");
  const [msg, setMsg] = useState("");
  const [about, setAbout] = useState(false);
  const closeAbout = useCallback(() => setAbout(false), []);
  const suggestion = suggestedGoal(p);

  useEffect(() => {
    getDoc(remindersDoc(profile.id)).then((snap) => setR({ ...DEFAULT_REMINDERS, ...snap.data(), user_id: profile.id }));
    pushState().then(setPush).catch(() => setPush("unsupported"));
  }, [profile.id]);

  const num = (v: string) => (v === "" ? null : Number(v.replace(",", ".")));

  async function saveProfile() {
    // Só as metas: peso, foto, nome etc. são gravados em outras telas e a cópia local pode estar velha.
    try {
      await updateDoc(profileDoc(p.id), { kcal_goal: p.kcal_goal, water_goal_ml: p.water_goal_ml, sleep_goal_min: p.sleep_goal_min });
      setMsg("Salvo.");
      onSaved();
    } catch {
      setMsg("Confira os valores e tente de novo.");
    }
  }

  async function saveReminders(next: Reminders) {
    setR(next);
    // Só as preferências: os campos last_* são do servidor (send-reminders).
    const prefs = Object.fromEntries(Object.keys(DEFAULT_REMINDERS).map((k) => [k, next[k as keyof Reminders]]));
    await setDoc(remindersDoc(next.user_id), prefs, { merge: true });
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
        <button className="link back" onClick={onBack}>‹ Perfil</button>
        <p className="eyebrow">{p.name || "Você"}</p>
        <h1 className="day-title">Ajustes</h1>
      </header>

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

      <DietSection {...diet} profile={p} onGoals={async (goals) => {
        const next = { ...p, ...goals };
        setP(next);
        await updateDoc(profileDoc(next.id), { kcal_goal: next.kcal_goal, water_goal_ml: next.water_goal_ml }).then(onSaved, () => setMsg("Confira os valores e tente de novo."));
      }} />

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
        <button className="btn ghost" onClick={() => signOut(auth)}>Sair</button>
        <button className="link" onClick={() => setAbout(true)}>Sobre o Yune</button>
        <p className="colophon">Yune · estimativas de calorias são aproximadas e não substituem orientação profissional.</p>
      </section>
      {about && <AboutSheet onClose={closeAbout} />}
    </main>
  );
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

/** Arquivo escolhido → tipo aceito pelas regras do Storage (o iPhone às vezes não informa o tipo). */
function fileType(f: File) {
  const ext = f.name.toLowerCase().split(".").pop() ?? "";
  if (f.type === "application/pdf" || ext === "pdf") return { type: "application/pdf", ext: "pdf" };
  if (f.type === DOCX || ext === "docx") return { type: DOCX, ext: "docx" };
  if (f.type.startsWith("text/") || ext === "txt") return { type: "text/plain", ext: "txt" };
  if (f.type.startsWith("image/") || /^(jpe?g|png|webp|heic|heif)$/.test(ext)) return { type: "image/jpeg", ext: "jpg" };
  return null;
}

function DietSection({ allowed, plan, onOpen, onChanged, profile, onGoals }: DietProps & {
  profile: Profile;
  onGoals: (g: Pick<Profile, "kcal_goal" | "water_goal_ml">) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [paste, setPaste] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (!allowed && !plan) {
    return (
      <section className="group">
        <h2 className="section-title">Dieta <span className="pro-badge">Pro</span></h2>
        <p className="note">Envie a dieta do seu nutricionista ou médico: o Yune ajusta as metas, mostra as opções de cada refeição e avisa quando algo foge do combinado.</p>
      </section>
    );
  }

  async function run(body: Parameters<typeof importDietPlan>[0], uploaded?: string) {
    const res = await importDietPlan(body);
    if (res.error) {
      if (uploaded) await deleteObject(ref(storage, uploaded)).catch(() => {});
      setMsg({ kind: "err", text: res.error });
      return;
    }
    setPaste(null);
    setMsg({ kind: "ok", text: "Dieta pronta." });
    onChanged();
  }

  async function onFile(f?: File) {
    if (!f) return;
    setMsg(null);
    if (/\.doc$/i.test(f.name)) return setMsg({ kind: "err", text: "Arquivo .doc antigo: salve como PDF ou .docx e envie de novo." });
    const kind = fileType(f);
    if (!kind) return setMsg({ kind: "err", text: "Use PDF, Word (.docx), texto ou foto." });
    setBusy(true);
    try {
      // Foto: reduz mantendo o texto legível.
      const blob = kind.ext === "jpg" ? (await compressImage(f, 2400, 0.9)).blob : f;
      if (blob.size > 10 * 1024 * 1024) throw new Error("Arquivo grande demais (máx. 10 MB).");
      const path = `diet-plans/${profile.id}/${crypto.randomUUID()}.${kind.ext}`;
      await uploadBytes(ref(storage, path), blob, { contentType: kind.type });
      await run({ path, name: f.name }, path);
    } catch (e) {
      setMsg({ kind: "err", text: (e as Error).message || "Não foi possível enviar." });
    } finally {
      setBusy(false);
    }
  }

  async function fromText() {
    setBusy(true);
    setMsg(null);
    await run({ text: paste ?? "" });
    setBusy(false);
  }

  async function remove() {
    if (!plan) return;
    await deleteDoc(row("diet_plans", plan.id));
    if (plan.file_path) await deleteObject(ref(storage, plan.file_path)).catch(() => {});
    setConfirm(false);
    setMsg(null);
    onChanged();
  }

  const t = plan?.targets;
  const goals = allowed && t && {
    kcal_goal: t.kcal != null ? clamp(t.kcal, 800, 6000) : profile.kcal_goal,
    water_goal_ml: t.water_ml != null ? clamp(t.water_ml, 250, 8000) : profile.water_goal_ml,
  };
  const goalsDiffer = goals && (goals.kcal_goal !== profile.kcal_goal || goals.water_goal_ml !== profile.water_goal_ml);

  // Sem Pro o plano continua aqui, só para ler (apagar é dado da pessoa).
  if (!allowed) {
    return (
      <section className="group">
        <h2 className="section-title">Dieta <span className="pro-badge">Pro</span></h2>
        <button className="diet-card" onClick={onOpen}>
          <b>{plan!.title}</b>
          <small>{[plan!.prescriber, plan!.file_name].filter(Boolean).join(" · ") || "Ver dieta"}</small>
        </button>
        <p className="note">Seu plano continua aqui. Para enviar uma nova dieta, assine o Pro.</p>
        {confirm ? (
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>Manter</button>
            <button className="btn danger" onClick={remove}>Apagar dieta</button>
          </div>
        ) : (
          <button className="link" onClick={() => setConfirm(true)}>Remover dieta</button>
        )}
      </section>
    );
  }

  return (
    <section className="group">
      <h2 className="section-title">Dieta <span className="pro-badge">Pro</span></h2>
      <input ref={input} type="file" hidden accept=".pdf,.docx,.txt,application/pdf,text/plain,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />

      {plan ? (
        <>
          <button className="diet-card" onClick={onOpen}>
            <b>{plan.title}</b>
            <small>{[plan.prescriber, plan.file_name].filter(Boolean).join(" · ") || "Ver dieta"}</small>
          </button>
          {goals && goalsDiffer && (
            <button className="btn ghost" disabled={busy} onClick={() => onGoals(goals)}>
              Usar metas da dieta: {fmtNum(goals.kcal_goal)} kcal · {fmtLiters(goals.water_goal_ml)} L
            </button>
          )}
        </>
      ) : (
        <p className="note">Envie a dieta que você recebeu (PDF, Word, texto ou foto). O Yune organiza as refeições, ajusta as metas e avisa quando algo foge do combinado.</p>
      )}

      {busy ? (
        <p className="thinking"><span className="pulse">Lendo a dieta… pode levar um minuto</span></p>
      ) : paste !== null ? (
        <>
          <label className="field"><span>Texto da dieta</span>
            <textarea rows={8} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Cole aqui a dieta como recebeu" /></label>
          <div className="row">
            <button className="btn ghost" onClick={() => setPaste(null)}>Cancelar</button>
            <button className="btn primary" disabled={paste.trim().length < 20} onClick={fromText}>Ler dieta</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn ghost" onClick={() => input.current?.click()}>{plan ? "Trocar arquivo" : "Enviar arquivo"}</button>
          <button className="btn ghost" onClick={() => setPaste("")}>Colar texto</button>
        </div>
      )}

      {plan && !busy && (confirm ? (
        <div className="row">
          <button className="btn ghost" onClick={() => setConfirm(false)}>Manter</button>
          <button className="btn danger" onClick={remove}>Apagar dieta</button>
        </div>
      ) : (
        <button className="link" onClick={() => setConfirm(true)}>Remover dieta</button>
      ))}
      {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}
    </section>
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
