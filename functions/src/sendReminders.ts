// Envia lembretes (água, hora de dormir) e o resumo do fim do dia via Web Push.
// Roda a cada 5 min pelo Cloud Scheduler.
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com)
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { defineSecret } from "firebase-functions/params";
import { onSchedule } from "firebase-functions/v2/scheduler";
import webpush from "web-push";
import { mealDrinkMl } from "./fluids.js";
import { runAll, type Profile, type Reminders } from "./reminderStep.js";
import { localNow } from "./reminderTime.js";
import { REGION } from "./region.js";

const VAPID_PUBLIC_KEY = defineSecret("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = defineSecret("VAPID_PRIVATE_KEY");
const VAPID_SUBJECT = defineSecret("VAPID_SUBJECT");

/** Totais do dia `day` (AAAA-MM-DD) no fuso da pessoa. Sono conta no dia em que se acorda; água pura e bebidas das refeições à parte. */
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
    drinks_ml: sum(meals, "eaten_at", (d) => mealDrinkMl(d.items)),
    sleep_min: Math.round(sum(sleep, "wake_at", (d) => (Date.parse(d.wake_at) - Date.parse(d.bed_at)) / 60_000)),
  };
}

export const sendReminders = onSchedule(
  { schedule: "every 5 minutes", region: REGION, timeoutSeconds: 240, secrets: [VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT] },
  async () => {
    webpush.setVapidDetails(VAPID_SUBJECT.value() || "mailto:yune@example.com", VAPID_PUBLIC_KEY.value(), VAPID_PRIVATE_KEY.value());
    const db = getFirestore();
    const now = new Date();

    const reminders = await db.collection("reminders").get();
    const byId = new Map(reminders.docs.map((doc) => [doc.id, doc]));
    const { sent, failed } = await runAll(
      reminders.docs.map((doc) => ({ id: doc.id, data: doc.data() as Reminders })),
      (uid) => {
        const user = db.collection("users").doc(uid);
        return {
          now,
          subs: async () => (await user.collection("push_subscriptions").get()).docs.map((s) => ({
            endpoint: s.get("endpoint"), p256dh: s.get("p256dh"), auth: s.get("auth"),
            created_at: s.get("created_at") ?? null, remove: async () => { await s.ref.delete(); },
          })),
          profile: async () => {
            const snap = await user.get();
            return snap.exists ? (snap.data() as Profile) : undefined;
          },
          totals: (u, tz, day) => dailyTotals(db, u, tz, day),
          // Água ou bebida de refeição desde `since`.
          hasWaterSince: async (_u, since) =>
            !(await user.collection("water").where("drank_at", ">=", since).limit(1).get()).empty
            || (await user.collection("meals").where("eaten_at", ">=", since).get()).docs.some((m) => mealDrinkMl(m.get("items")) > 0),
          patch: async (_u, patch) => { await byId.get(uid)!.ref.update(patch); },
          push: async (sub, payload) => {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ ...payload, url: "/" }),
              { TTL: 60 * 60, timeout: 10_000 },
            );
          },
        };
      },
    );

    console.log(`send-reminders: ${sent} notificações, ${failed} falhas`);
  },
);
