import { Sheet } from "@/components/Sheet";
import { version } from "../../package.json";

const SITE = "https://smash.mrbarkan.com";
const SUPPORT = "opa@mrbarkan.com";

/** Sobre o app: versão, contato do suporte e site. */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Sobre" onClose={onClose}>
      <header className="about-head">
        <h3 className="wordmark">Yune</h3>
        <p className="note">Diário de comida, movimento, água e sono.</p>
      </header>

      <dl className="about-list">
        <div><dt>Versão</dt><dd>{version}</dd></div>
        <div><dt>Suporte</dt><dd><a href={`mailto:${SUPPORT}`}>{SUPPORT}</a></dd></div>
        <div><dt>Site</dt><dd><a href={SITE} target="_blank" rel="noopener">{SITE.replace("https://", "")}</a></dd></div>
      </dl>

      <p className="colophon">Estimativas de calorias são aproximadas e não substituem orientação profissional.</p>
    </Sheet>
  );
}
