// Envia lembretes (água, hora de dormir) e o resumo do fim do dia via Web Push.
// Roda a cada 5 min pelo Cloud Scheduler.
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com)
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import webpush from "web-push";
import { REGION } from "./region.js";

const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = defineSecret("VAPID_SUBJECT");

type Reminders = {
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

type Profile = { name: string | null; timezone: string; water_goal_ml: number; kcal_goal: number };

function localNow(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const liters = (ml: number) => (ml / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " L";
const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;

/** Totais do dia `day` (AAAA-MM-DD) no fuso da pessoa. Sono conta no dia em que se acorda. */
async function dailyTotals(db: Firestore, uid: string, tz: string, day: string) {
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const user = db.collection("users").doc(uid);
  const inDay = (iso: string) => localNow(tz, new Date(iso)).date === day;
  const recent = (name: string, field: string) => user.collection(name).where(field, ">=", since).get();
  const [meals, activities, water, sleep] = await Promise.all([
    recent("meals", "eaten_at"), recent("activities", "started_at"), recent("water", "drank_at"), recent("sleep", "wake_at"),
  ]);
  const sum = (snap: FirebaseFirestore.QuerySnapshot, field: string, value: (d: FirebaseFirestore.DocumentData) => number) =>
    snap.docs.map((d) => d.data()).filter((d) => inDay(d[field])).reduce((s, d) => s + value(d), 0);
  return {
    kcal_in: sum(meals, "eaten_at", (d) => d.kcal),
    kcal_out: sum(activities, "started_at", (d) => d.kcal),
    water_ml: sum(water, "drank_at", (d) => d.ml),
    sleep_min: Math.round(sum(sleep, "wake_at", (d) => (Date.parse(d.wake_at) - Date.parse(d.bed_at)) / 60_000)),
  };
}

export const sendReminders = onSchedule(
  { schedule: "every 5 minutes", region: REGION, secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] },
  async () => {
    webpush.setVapidDetails(VAPID_SUBJECT.value() || "mailto:yune@example.com", VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value());
    const db = getFirestore();
    const now = new Date();
    let sent = 0;

    const reminders = await db.collection("reminders").get();
    for (const doc of reminders.docs) {
      const uid = doc.id;
      const r = doc.data() as Reminders;
      const subs = await db.collection("users").doc(uid).collection("push_subscriptions").get();
      if (subs.empty) continue;
      const profileSnap = await db.collection("users").doc(uid).get();
      if (!profileSnap.exists) continue;
      const profile = profileSnap.data() as Profile;
      const tz = profile.timezone || "America/Sao_Paulo";
      const local = localNow(tz);
      const patch: Partial<Reminders> = {};

      async function send(payload: { title: string; body: string; tag: string }) {
        let delivered = 0;
        for (const s of subs.docs) {
          const { endpoint, p256dh, auth } = s.data();
          try {
            await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({ ...payload, url: "/" }), { TTL: 60 * 60 });
            delivered++;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await s.ref.delete();
          }
        }
        return delivered;
      }

      // Resumo do dia
      if (r.summary_enabled && r.last_summary_date !== local.date && local.minutes >= toMin(r.summary_time)) {
        const t = await dailyTotals(db, uid, tz, local.date);
        const net = t.kcal_in - t.kcal_out;
        const parts = [`${fmt(t.kcal_in)} kcal ingeridas`, `${fmt(t.kcal_out)} gastas`, liters(t.water_ml)];
        if (t.sleep_min) parts.push(`dormiu ${hm(t.sleep_min)}`);
        sent += await send({
          title: `Seu dia: ${fmt(net)} kcal líquidas`,
          body: parts.join(" · ") + ` — meta ${fmt(profile.kcal_goal)} kcal.`,
          tag: "summary",
        });
        patch.last_summary_date = local.date;
      }

      // Hora de dormir (janela de 2h após o horário)
      const bed = toMin(r.bedtime_time);
      if (r.bedtime_enabled && r.last_bedtime_date !== local.date && local.minutes >= bed && local.minutes < bed + 120) {
        sent += await send({ title: "Hora de desacelerar", body: "Telas para baixo. Anote quando for dormir.", tag: "bedtime" });
        patch.last_bedtime_date = local.date;
      }

      // Água: dentro da janela, se não bebeu (nem foi lembrada) no intervalo
      const inWindow = local.minutes >= toMin(r.water_start) && local.minutes < toMin(r.water_end);
      const since = new Date(now.getTime() - r.water_every_min * 60_000);
      if (r.water_enabled && inWindow && (!r.last_water_at || new Date(r.last_water_at) < since)) {
        const recent = await db.collection("users").doc(uid).collection("water")
          .where("drank_at", ">=", since.toISOString()).limit(1).get();
        if (recent.empty) {
          sent += await send({ title: "Um copo d'água?", body: `Meta de hoje: ${liters(profile.water_goal_ml)}.`, tag: "water" });
          patch.last_water_at = now.toISOString();
        }
      }

      if (Object.keys(patch).length) await doc.ref.update(patch);
    }

    console.log(`send-reminders: ${sent} notificações`);
  },
);
