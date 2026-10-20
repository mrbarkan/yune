// Hora local de quem recebe o lembrete, com fuso validado.
export const DEFAULT_TZ = "America/Sao_Paulo";

/** Fuso IANA válido ou o padrão (um timezone inválido no perfil não pode derrubar a rodada). */
export function safeTimeZone(tz: unknown): string {
  if (typeof tz !== "string" || !tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
}

export function localNow(tz: string, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}
