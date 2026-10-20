import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

type Deps = { load(path: string): Promise<Blob>; createUrl(b: Blob): string; revoke(u: string): void; graceMs?: number };

/** Cache de URLs `blob:` de arquivos privados: um download por caminho, com prazo antes de revogar. */
export function createUrlCache(d: Deps) {
  const map = new Map<string, { url: Promise<string>; refs: number; timer?: ReturnType<typeof setTimeout> }>();
  return {
    acquire(path: string): Promise<string> {
      let e = map.get(path);
      if (!e) {
        const url = d.load(path).then(d.createUrl);
        e = { url, refs: 0 };
        map.set(path, e);
        url.catch(() => { if (map.get(path)?.url === url) map.delete(path); }); // falha não fica no cache
      }
      clearTimeout(e.timer);
      e.refs++;
      return e.url;
    },
    release(path: string) {
      const e = map.get(path);
      if (!e) return;
      if (--e.refs > 0) return;
      e.timer = setTimeout(() => { map.delete(path); e.url.then(d.revoke, () => {}); }, d.graceMs ?? 60_000);
    },
    size: () => map.size,
  };
}

export const privateUrls = createUrlCache({
  load: (p) => getBlob(ref(storage, p)),
  createUrl: (b) => URL.createObjectURL(b),
  revoke: (u) => URL.revokeObjectURL(u),
});
