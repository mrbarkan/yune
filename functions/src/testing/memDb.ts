import type { Db } from "../billing.js";

// Só o que o código usa: doc(path).get()/set(data, { merge }) e runTransaction (tx.get/tx.set). O merge do
// Firestore é profundo; aqui os objetos aninhados (stripe) são sempre escritos inteiros, então o merge raso dá
// o mesmo resultado. `log` registra a ordem (leitura e escrita na transação, listagem na Stripe).
export function memDb(init: Record<string, Record<string, unknown>> = {}): Db & { docs: Map<string, Record<string, unknown>>; writes: string[]; log: string[] } {
  const docs = new Map(Object.entries(init).map(([k, v]) => [k, structuredClone(v)]));
  const writes: string[] = [];
  const log: string[] = [];
  const read = (path: string) => {
    const d = docs.get(path);
    return { get: (f: string) => (d ? structuredClone(d[f]) : undefined) };
  };
  const write = (path: string, data: Record<string, unknown>, opts: { merge: boolean }) => {
    writes.push(path);
    docs.set(path, opts.merge ? { ...docs.get(path), ...structuredClone(data) } : structuredClone(data));
  };
  type Ref = { path: string };
  return {
    docs,
    writes,
    log,
    doc(path: string) {
      return {
        path,
        async get() {
          return read(path);
        },
        async set(data: Record<string, unknown>, opts: { merge: boolean }) {
          log.push(`set ${path}`);
          write(path, data, opts);
        },
      };
    },
    // Como no Firestore: as escritas da transação só valem quando a função termina.
    async runTransaction<T>(fn: (tx: { get(ref: Ref): Promise<{ get(f: string): unknown }>; set(ref: Ref, data: Record<string, unknown>, opts: { merge: boolean }): unknown }) => Promise<T>) {
      const pending: (() => void)[] = [];
      const result = await fn({
        async get(ref) {
          log.push(`tx.get ${ref.path}`);
          return read(ref.path);
        },
        set(ref, data, opts) {
          log.push(`tx.set ${ref.path}`);
          pending.push(() => write(ref.path, data, opts));
        },
      });
      pending.forEach((w) => w());
      return result;
    },
  };
}
