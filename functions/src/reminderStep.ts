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
  /** Mostra calorias e metas nas notificações (padrão false: tela bloqueada sem números). */
  push_details?: boolean;
  /** Pergunta sobre lanches depois de 4 h sem refeição (ausente = ligado, docs antigos). */
  gap_enabled?: boolean;
  last_water_at?: string | null;
  last_summary_date?: string | null;
  last_bedtime_date?: string | null;
  last_gap_at?: string | null;
  gap_count_date?: string | null;
  gap_count?: number;
};

export type Profile = { name: string | null; timezone: string; water_goal_ml: number; kcal_goal: number };
export type Sub = { endpoint: string; p256dh: string; auth: string; created_at?: string | null; remove(): Promise<void> };
/** `water_ml` é só a água pura; `drinks_ml`, as bebidas das refeições (as duas somam na meta). */
export type Totals = { kcal_in: number; kcal_out: number; water_ml: number; drinks_ml: number; sleep_min: number };
export type Payload = { title: string; body: string; tag: string; url?: string; actions?: { action: string; title: string }[] };

export type Deps = {
  subs(uid: string): Promise<Sub[]>;
  profile(uid: string): Promise<Profile | undefined>;
  totals(uid: string, tz: string, day: string): Promise<Totals>;
  hasWaterSince(uid: string, sinceIso: string): Promise<boolean>;
  /** eaten_at da refeição mais recente, ou null. */
  lastMealAt(uid: string): Promise<string | null>;
  /** Sono aberto (wake_at nulo) que começou há até 20 h. */
  sleepingNow(uid: string): Promise<boolean>;
  /** Grava campos last_* em reminders/{uid}. */
  patch(uid: string, patch: Partial<Reminders>): Promise<void>;
  /** Envia uma notificação; lança com statusCode em caso de falha. */
  push(sub: Sub, payload: Payload): Promise<void>;
  now: Date;
};

export const MAX_DEVICES = 5;
const GAP_MS = 4 * 3_600_000;
const GAP_MAX_PER_DAY = 2;

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const fmt = (n: number) => n.toLocaleString("pt-BR");
const liters = (ml: number) => (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " L";
/** "1,6 L (1,1 L de água)"; só "1,6 L" quando os dois arredondam igual (como o rótulo do copo no app). */
const fluid = (t: Totals) => {
  const total = liters(t.water_ml + t.drinks_ml);
  const water = liters(t.water_ml);
  return total === water ? total : `${total} (${water} de água)`;
};
const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** "desde o almoço" etc. pelo horário local (mesmos limites de mealName no app). */
export function slotPhrase(localMinutes: number): string {
  const h = Math.floor(localMinutes / 60);
  if (h >= 5 && h < 11) return "desde o café da manhã";
  if (h >= 11 && h < 15) return "desde o almoço";
  if (h >= 15 && h < 18) return "desde o lanche";
  if (h >= 18 && h < 23) return "desde o jantar";
  return "desde a ceia";
}

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
    const url = `/?fechar=${local.date}`;
    let payload: Payload = { title: "Seu resumo do dia está pronto", body: "Toque para ver no Yune.", tag: "summary", url };
    if (r.push_details === true) {
      const t = await d.totals(uid, tz, local.date);
      const net = t.kcal_in - t.kcal_out;
      const parts = [`${fmt(t.kcal_in)} kcal ingeridas`, `${fmt(t.kcal_out)} gastas`, fluid(t)];
      if (t.sleep_min) parts.push(`dormiu ${hm(t.sleep_min)}`);
      payload = { title: `Seu dia: ${fmt(net)} kcal líquidas`, body: parts.join(" · ") + ` — meta ${fmt(profile.kcal_goal)} kcal.`, tag: "summary", url };
    }
    sent += await send(payload);
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
      const body = r.push_details === true ? `Meta de hoje: ${liters(profile.water_goal_ml)}.` : "Hora de se hidratar.";
      sent += await send({ title: "Um copo d'água?", body, tag: "water" });
      await d.patch(uid, { last_water_at: d.now.toISOString() });
    }
  }

  // Lanche: 4 h sem refeição dentro da janela, nunca dormindo; no máximo 2 por dia, nunca o mesmo intervalo; sem números.
  if (r.gap_enabled !== false && inWindow && !(await d.sleepingNow(uid))) {
    // Início da janela de hoje (inWindow garante que não é negativo; mudança de horário de verão desloca, aceito).
    const windowStart = new Date(d.now.getTime() - (local.minutes - toMin(r.water_start)) * 60_000).toISOString();
    const raw = await d.lastMealAt(uid);
    const last = raw && !Number.isNaN(Date.parse(raw)) ? new Date(raw).toISOString() : null;
    const gapStart = last && last > windowStart ? last : windowStart;
    const count = r.gap_count_date === local.date ? r.gap_count ?? 0 : 0;
    if (d.now.getTime() - Date.parse(gapStart) >= GAP_MS && count < GAP_MAX_PER_DAY && (!r.last_gap_at || r.last_gap_at < gapStart)) {
      const now = d.now.toISOString();
      const title = last && last >= windowStart ? `Beliscou algo ${slotPhrase(localNow(tz, new Date(last)).minutes)}?` : "Beliscou algo hoje?";
      sent += await send({
        title, body: "Um toque registra.", tag: "gap",
        url: `/?registrar=lanche&de=${encodeURIComponent(gapStart)}&ate=${encodeURIComponent(now)}`,
        actions: [{ action: "nada", title: "Nada" }, { action: "registrar", title: "Registrar" }],
      });
      await d.patch(uid, { last_gap_at: now, gap_count_date: local.date, gap_count: count + 1 });
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
