export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

/** Hora do dia como número fracionário (0–24) relativo ao início do dia `day`. */
export const hourOf = (iso: string | Date, day: Date) =>
  (new Date(iso).getTime() - startOfDay(day).getTime()) / 3_600_000;

export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const fmtDayLong = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });

export const fmtWeekday = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
};

export const fmtNum = (n: number) => Math.round(n).toLocaleString("pt-BR");
export const fmtLiters = (ml: number) =>
  (ml / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Valor para <input type="datetime-local"> no fuso local. */
export const toLocalInput = (d: Date) => {
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
export const fromLocalInput = (v: string) => new Date(v).toISOString();

/** Horário sugerido para um registro novo: `at` se `day` é hoje; num dia anterior, a mesma hora do dia na data vista. */
export const backfillAt = (day: Date, at: Date, now = new Date()) =>
  sameDay(day, now) ? at : new Date(day.getFullYear(), day.getMonth(), day.getDate(), at.getHours(), at.getMinutes());

/** dd/mm no fuso da pessoa; fora do ano corrente (nesse fuso) vira dd/mm/aaaa. */
export function fmtDayMonth(iso: string, tz: string, now: Date = new Date()) {
  const d = new Date(iso);
  const year = (x: Date) => x.toLocaleDateString("en-CA", { year: "numeric", timeZone: tz });
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", timeZone: tz };
  if (year(d) !== year(now)) opts.year = "numeric";
  return d.toLocaleDateString("pt-BR", opts);
}
