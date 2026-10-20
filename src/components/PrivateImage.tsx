import { useEffect, useState } from "react";
import { privateUrls } from "@/lib/privateUrl";

/** Imagem privada do Storage: baixa o arquivo como blob (sem URL pública, cache compartilhado) e não deixa arrastar nem salvar com toque longo. */
export function PrivateImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setSrc(null);
    privateUrls.acquire(path).then(
      (url) => { if (live) setSrc(url); },
      () => {},
    );
    return () => {
      live = false;
      privateUrls.release(path);
    };
  }, [path]);

  if (!src) return null;
  return <img className={`private-img${className ? ` ${className}` : ""}`} src={src} alt={alt} draggable={false} decoding="async"
    onContextMenu={(e) => e.preventDefault()} />;
}
