import { useState } from "react";
import { Sheet } from "@/components/Sheet";

export function AiConsentSheet({ onAgree, onClose }: { onAgree: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function agree() {
    setBusy(true);
    setErr("");
    try {
      await onAgree();
    } catch {
      setErr("Não foi possível salvar agora. Tente de novo.");
      setBusy(false);
    }
  }

  return (
    <Sheet title="Leitura por IA" onClose={onClose}>
      <p>Para estimar refeições e ler rótulos, dietas e exames, o Yune envia o texto, a foto ou o documento que você escolher para a Anthropic, empresa dos EUA que fornece a IA (Claude). Isso é uma transferência internacional de dados de saúde.</p>
      <ul>
        <li>Só vai o que você enviar, na hora em que enviar.</li>
        <li>A Anthropic não usa esses dados para treinar modelos.</li>
        <li>Você pode desligar quando quiser em Ajustes › Leitura por IA. Sem a IA, você continua registrando tudo à mão.</li>
      </ul>
      {err && <p className="note err">{err}</p>}
      <div className="row">
        <button className="btn ghost" disabled={busy} onClick={onClose}>Agora não</button>
        <button className="btn primary" disabled={busy} onClick={agree}>{busy ? "…" : "Concordo"}</button>
      </div>
    </Sheet>
  );
}
