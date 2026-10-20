import { useEffect, useState } from "react";
import { privateUrls } from "@/lib/privateUrl";

const warned = new Set<string>();
function warnOnce(path: string, err: unknown) {
  if (warned.has(path)) return;
  warned.add(path);
  console.warn(`Imagem privada indisponível (${path}). Confira o CORS do bucket.`, err);
}

/** Imagem privada do Storage: baixa o arquivo como blob (sem URL pública, cache compartilhado) e não deixa arrastar nem salvar com toque longo. */
export function PrivateImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setSrc(null);
    setFailed(false);
    const h = privateUrls.acquire(path);
    h.url.then(
      (url) => { if (live) setSrc(url); },
      (err) => {
        warnOnce(path, err);
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
      h.release();
    };
  }, [path]);

  if (failed) return <span className={`private-img failed${className ? ` ${className}` : ""}`} role="img" aria-label="Imagem indisponível" />;
  if (!src) return null;
  return <img className={`private-img${className ? ` ${className}` : ""}`} src={src} alt={alt} draggable={false} decoding="async"
    onContextMenu={(e) => e.preventDefault()} />;
}
