import { useEffect, useRef } from "react";

// Folhas abertas, da mais antiga à mais nova: só a de cima trata o Escape, e o body só destrava quando a pilha esvazia.
const stack: symbol[] = [];

export function Sheet({ title, accent, onClose, children }: {
  title: string;
  accent?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const token = Symbol("sheet");
    stack.push(token);
    if (stack.length === 1) document.body.classList.add("locked");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || stack[stack.length - 1] !== token) return;
      e.stopImmediatePropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      stack.splice(stack.indexOf(token), 1);
      if (stack.length === 0) document.body.classList.remove("locked");
    };
  }, []);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title}
        style={accent ? ({ "--accent": `var(--${accent})` } as React.CSSProperties) : undefined}
        onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value}
          className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
