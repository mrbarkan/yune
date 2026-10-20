// Passo por pessoa do sendReminders, com dependências injetadas (testável sem Firestore nem Web Push).
import { localNow, safeTimeZone } from "./reminderTime.js";

export type Reminders = {
  water_enabled: boolean;
  water_every_min: number;
  water_start: string;
  water_end: string;
  summary_enabled: boolean;
  summary_time: string;
  bedtime_enabled: boolean;
  bedtime_time: string;
  last_water_at?: string | null;
  last_summary_date?: string | null;
  last_bedtime_date?: string | null;
};

export type Profile = { name: string | null; timezone: string; water_goal_ml: number; kcal_goal: number };
export type Sub = { endpoint: string; p256dh: string; auth: string; created_at?: string | null; remove(): Promise<void> };
export type Totals = { kcal_in: number; kcal_out: number; water_ml: number; sleep_min: number };
export type Payload = { title: string; body: string; tag: string };

export type Deps = {
  subs(uid: string): Promise<Sub[]>;
  profile(uid: string): Promise<Profile | undefined>;
  totals(uid: string, tz: string, day: string): Promise<Totals>;
  hasWaterSince(uid: string, sinceIso: string): Promise<boolean>;
  /** Grava campos last_* em reminders/{uid}. */
  patch(uid: string, patch: Partial<Reminders>): Promise<void>;
  /** Envia uma notificação; lança com statusCode em caso de falha. */
  push(sub: Sub, payload: Payload): Promise<void>;
  now: Date;
};

export const MAX_DEVICES = 5;

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (n: number) => n.toLocaleString("pt-BR");
const liters = (ml: number) => (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " L";
const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Devolve quantas notificações foram entregues. Cada lembrete grava seu last_* logo após o envio. */
export async function processUser(uid: string, r: Reminders, d: Deps): Promise<number> {
  const all = await d.subs(uid);
  if (!all.length) return 0;
  const targets = [...all]
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    .slice(0, MAX_DEVICES);
  const profile = await d.profile(uid);
  if (!profile) return 0;
  const tz = safeTimeZone(profile.timezone);
  const local = localNow(tz, d.now);
  let sent = 0;

  async function send(payload: Payload) {
    let delivered = 0;
    for (const s of targets) {
      try {
        await d.push(s, payload);
        delivered++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          try { await s.remove(); } catch { /* assinatura morta: tenta de novo na próxima rodada */ }
        } else {
          console.error("send-reminders: envio falhou", uid, err instanceof Error ? err.name : "erro", status ?? "");
        }
      }
    }
    return delivered;
  }

  // Resumo do dia
  if (r.summary_enabled && r.last_summary_date !== local.date && local.minutes >= toMin(r.summary_time)) {
    const t = await d.totals(uid, tz, local.date);
    const net = t.kcal_in - t.kcal_out;
    const parts = [`${fmt(t.kcal_in)} kcal ingeridas`, `${fmt(t.kcal_out)} gastas`, liters(t.water_ml)];
    if (t.sleep_min) parts.push(`dormiu ${hm(t.sleep_min)}`);
    sent += await send({
      title: `Seu dia: ${fmt(net)} kcal líquidas`,
      body: parts.join(" · ") + ` — meta ${fmt(profile.kcal_goal)} kcal.`,
      tag: "summary",
    });
    await d.patch(uid, { last_summary_date: local.date });
  }

  // Hora de dormir (janela de 2h após o horário)
  const bed = toMin(r.bedtime_time);
  if (r.bedtime_enabled && r.last_bedtime_date !== local.date && local.minutes >= bed && local.minutes < bed + 120) {
    sent += await send({ title: "Hora de desacelerar", body: "Telas para baixo. Anote quando for dormir.", tag: "bedtime" });
    await d.patch(uid, { last_bedtime_date: local.date });
  }

  // Água: dentro da janela, se não bebeu (nem foi lembrada) no intervalo
  const inWindow = local.minutes >= toMin(r.water_start) && local.minutes < toMin(r.water_end);
  const since = new Date(d.now.getTime() - r.water_every_min * 60_000);
  if (r.water_enabled && inWindow && (!r.last_water_at || new Date(r.last_water_at) < since)) {
    if (!(await d.hasWaterSince(uid, since.toISOString()))) {
      sent += await send({ title: "Um copo d'água?", body: `Meta de hoje: ${liters(profile.water_goal_ml)}.`, tag: "water" });
      await d.patch(uid, { last_water_at: d.now.toISOString() });
    }
  }
  return sent;
}

/** Roda todas as pessoas; o erro de uma não interrompe as outras. */
export async function runAll(
  docs: { id: string; data: Reminders }[],
  makeDeps: (uid: string) => Deps,
): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const { id, data } of docs) {
    try {
      sent += await processUser(id, data, makeDeps(id));
    } catch (err) {
      failed++;
      console.error("send-reminders: falha", id, err instanceof Error ? err.name : "erro");
    }
  }
  return { sent, failed };
}
