/** Erro de permissão do Firestore: logo após confirmar o e-mail o token ainda pode vir sem email_verified. */
export const isDenied = (err: unknown) => (err as { code?: string } | null)?.code === "permission-denied";

/**
 * Roda `fn`; se negar por permissão, renova o token (`refresh`) e tenta de novo, até `tries` vezes.
 * Outros erros e a última negação sobem para quem chamou.
 */
export async function retryDenied<T>(
  fn: () => Promise<T>,
  refresh: () => Promise<unknown>,
  tries = 3,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDenied(err) || i >= tries) throw err;
      await refresh().catch(() => {});
      await wait(300 * i);
    }
  }
}
