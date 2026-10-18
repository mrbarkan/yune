// Envia lembretes (água, hora de dormir) e o resumo do fim do dia via Web Push.
// Chamado pelo pg_cron a cada 5 min com o header x-cron-key.
// Segredos: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex.: mailto:voce@email.com)
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:yune@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

function localNow(tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
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

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function send(subs: Sub[], payload: { title: string; body: string; tag: string }) {
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ ...payload, url: "/" }),
        { TTL: 60 * 60 },
      );
      delivered++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return delivered;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-key") !== Deno.env.get("CRON_SECRET")) return json({ error: "unauthorized" });

  const { data: rows, error } = await db
    .from("reminders")
    .select("*, profiles!inner(name, timezone, water_goal_ml, kcal_goal)");
  if (error) return json({ error: error.message });

  const now = new Date();
  let sent = 0;

  for (const r of rows ?? []) {
    const tz = r.profiles.timezone || "America/Sao_Paulo";
    const local = localNow(tz);
    const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", r.user_id);
    if (!subs?.length) continue;
    const patch: Record<string, unknown> = {};

    // Resumo do dia
    if (r.summary_enabled && r.last_summary_date !== local.date && local.minutes >= toMin(r.summary_time)) {
      const { data: t } = await db.rpc("daily_totals", { p_user: r.user_id, p_day: local.date }).single();
      const totals = t as { kcal_in: number; kcal_out: number; water_ml: number; sleep_min: number } | null;
      if (totals) {
        const net = totals.kcal_in - totals.kcal_out;
        const parts = [`${fmt(totals.kcal_in)} kcal ingeridas`, `${fmt(totals.kcal_out)} gastas`, liters(totals.water_ml)];
        if (totals.sleep_min) parts.push(`dormiu ${hm(totals.sleep_min)}`);
        sent += await send(subs, {
          title: `Seu dia: ${fmt(net)} kcal líquidas`,
          body: parts.join(" · ") + ` — meta ${fmt(r.profiles.kcal_goal)} kcal.`,
          tag: "summary",
        });
      }
      patch.last_summary_date = local.date;
    }

    // Hora de dormir (janela de 2h após o horário)
    const bed = toMin(r.bedtime_time);
    if (r.bedtime_enabled && r.last_bedtime_date !== local.date && local.minutes >= bed && local.minutes < bed + 120) {
      sent += await send(subs, { title: "Hora de desacelerar", body: "Telas para baixo. Anote quando for dormir.", tag: "bedtime" });
      patch.last_bedtime_date = local.date;
    }

    // Água: dentro da janela, se não bebeu (nem foi lembrada) no intervalo
    const inWindow = local.minutes >= toMin(r.water_start) && local.minutes < toMin(r.water_end);
    const since = new Date(now.getTime() - r.water_every_min * 60_000);
    if (r.water_enabled && inWindow && (!r.last_water_at || new Date(r.last_water_at) < since)) {
      const { data: recent } = await db.from("water").select("id").eq("user_id", r.user_id)
        .gte("drank_at", since.toISOString()).limit(1);
      if (!recent?.length) {
        sent += await send(subs, { title: "Um copo d'água?", body: `Meta de hoje: ${liters(r.profiles.water_goal_ml)}.`, tag: "water" });
        patch.last_water_at = now.toISOString();
      }
    }

    if (Object.keys(patch).length) await db.from("reminders").update(patch).eq("user_id", r.user_id);
  }

  return json({ ok: true, sent });
});
