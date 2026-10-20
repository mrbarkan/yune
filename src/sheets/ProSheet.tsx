import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { createCheckout, getProPrices, type ProPrice, type ProPrices } from "@/lib/firebase";
import { PRO_OPEN } from "@/lib/pro";

const BENEFITS = [
  ["Dieta do nutricionista", "Envie o plano e receba avisos e opções por refeição."],
  ["Exames com gráficos", "Resultados de laboratório com faixa de referência e evolução."],
  ["Composição corporal", "Bioimpedância e sua evolução ao longo do tempo."],
];

const money = (p: ProPrice) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: p.currency.toUpperCase() }).format(p.amount / 100);

export function ProSheet({ onClose }: { onClose: () => void }) {
  const [prices, setPrices] = useState<ProPrices | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<"monthly" | "annual" | null>(null);

  useEffect(() => {
    if (PRO_OPEN) return;
    let alive = true;
    getProPrices().then((r) => {
      if (!alive) return;
      if ("error" in r) setErr(r.error);
      else setPrices(r);
    });
    return () => { alive = false; };
  }, []);

  async function subscribe(plan: "monthly" | "annual") {
    setBusy(plan);
    setErr("");
    const r = await createCheckout(plan);
    if (r.url) {
      location.href = r.url;
      return;
    }
    setErr(r.error || "Não foi possível abrir o pagamento agora.");
    setBusy(null);
  }

  return (
    <Sheet title="Yune Pro" onClose={onClose}>
      <ul className="pro-benefits">
        {BENEFITS.map(([t, d]) => <li key={t}><b>{t}</b><small>{d}</small></li>)}
      </ul>
      {PRO_OPEN ? (
        <p className="note">Durante o beta, o Pro está liberado para todos.</p>
      ) : (
        <>
          {prices?.trial === "7d" && <p className="note ok">7 dias grátis para começar.</p>}
          {prices?.trial === "beta" && <p className="note">Sem cobrança até o fim do seu Pro do beta.</p>}
          {prices && (
            <div className="pro-plans">
              <button className="btn primary" disabled={!!busy} onClick={() => subscribe("monthly")}>
                {busy === "monthly" ? "Abrindo…" : `Assinar mensal · ${money(prices.monthly)}/mês`}
              </button>
              <button className="btn ghost" disabled={!!busy} onClick={() => subscribe("annual")}>
                {busy === "annual" ? "Abrindo…" : `Assinar anual · ${money(prices.annual)}/ano`}
              </button>
            </div>
          )}
          {!prices && !err && <p className="note">Carregando preços…</p>}
        </>
      )}
      {err && <p className="note err">{err}</p>}
    </Sheet>
  );
}
