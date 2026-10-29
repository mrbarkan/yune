import { useEffect, useRef } from "react";

/** "Registrado · Desfazer" por 5 s; `onExpire` quando some sem desfazer. Um `key` novo reinicia o prazo. */
export function UndoToast({ onUndo, onExpire }: { onUndo: () => void; onExpire: () => void }) {
  const expire = useRef(onExpire);
  expire.current = onExpire;
  useEffect(() => {
    const t = setTimeout(() => expire.current(), 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="toast" role="status">
      <span>Registrado</span>
      <span aria-hidden>·</span>
      <button onClick={onUndo}>Desfazer</button>
    </div>
  );
}
