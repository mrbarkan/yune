import { useEffect, useState } from "react";
import { getBlob, ref } from "firebase/storage";
import { storage } from "@/lib/firebase";

/** Imagem privada do Storage: baixa o arquivo como blob (sem URL pública) e não deixa arrastar nem salvar com toque longo. */
export function PrivateImage({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let live = true;
    setSrc(null);
    getBlob(ref(storage, path)).then(
      (blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      },
      () => {},
    );
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  if (!src) return null;
  return <img className={`private-img${className ? ` ${className}` : ""}`} src={src} alt={alt} draggable={false}
    onContextMenu={(e) => e.preventDefault()} />;
}
