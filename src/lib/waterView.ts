import { DEFAULT_WATER_SIZES } from "./defaults";
import type { Profile, WaterContainer } from "./firebase";

export type Fluids = { water: number; drinks: number };
export type WaterLoad = { base: Fluids | null; failed: boolean };

/** O que o copo mostra: total (água + bebidas das refeições) só quando o dia carregou; sem ele, só o que foi somado agora. */
export function waterView({ base, failed }: WaterLoad, added: number) {
  const ready = base !== null;
  return {
    canAdd: ready || failed,
    total: ready ? base.water + added + base.drinks : null,
    water: ready ? base.water + added : null,
    drinks: ready ? base.drinks : null,
    onlyAdded: !ready && failed && added > 0 ? added : null,
  };
}

/** Botões da folha Água: os recipientes com nome; sem eles, os quatro copos antigos (ou os padrão). */
export function containersOf(p: Pick<Profile, "water_containers" | "water_sizes">): WaterContainer[] {
  const list = p.water_containers;
  if (list && list.length >= 1 && list.length <= 6) return list;
  return (p.water_sizes?.length === 4 ? p.water_sizes : DEFAULT_WATER_SIZES).map((ml) => ({ name: "Copo", ml }));
}

/** Mesmas regras de validWaterContainers (firestore.rules); null = pode salvar. */
export function validContainers(list: WaterContainer[]): string | null {
  if (list.length < 1 || list.length > 6) return "De 1 a 6 recipientes.";
  if (list.some((c) => !c.name.trim() || c.name.length > 40)) return "Dê um nome a cada recipiente.";
  if (list.some((c) => !Number.isInteger(c.ml) || c.ml < 10 || c.ml > 3000)) return "Use valores entre 10 e 3000 ml.";
  return null;
}
