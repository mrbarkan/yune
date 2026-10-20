/** Volta do Checkout: `?pro=ok` ou `?pro=cancel` na URL do app. */
export type ProReturn = "ok" | "cancel" | null;

export function parseProReturn(search: string): ProReturn {
  const v = new URLSearchParams(search).get("pro");
  return v === "ok" || v === "cancel" ? v : null;
}

/** URL sem o parâmetro `pro` (mantém os outros e o hash). */
export function withoutProParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete("pro");
  return u.pathname + u.search + u.hash;
}
