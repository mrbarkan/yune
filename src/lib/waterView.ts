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
