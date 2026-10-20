/** Dados mais velhos que isso são recarregados ao voltar para o app. */
export const STALE_MS = 5 * 60_000;

/** Volta para o app: recarrega se passaram 5 min ou se o dia virou. */
export const shouldRefresh = (last: number, now: number, staleMs = STALE_MS) =>
  now - last >= staleMs || new Date(last).toDateString() !== new Date(now).toDateString();
