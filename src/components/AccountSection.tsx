import { useCallback, useState } from "react";
import { DeleteAccountSheet } from "@/sheets/DeleteAccountSheet";

/** Entrada de "Apagar minha conta e meus dados", logo abaixo de "Seus dados". */
export function AccountSection() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <section className="group">
      <button className="link danger" onClick={() => setOpen(true)}>Apagar minha conta e meus dados</button>
      {open && <DeleteAccountSheet onClose={close} />}
    </section>
  );
}
