export type WaterLoad = { base: number | null; failed: boolean };

/** O que o copo mostra: total só quando o valor de hoje carregou; sem ele, só o que foi somado agora. */
export function waterView({ base, failed }: WaterLoad, added: number) {
  const ready = base !== null;
  return {
    canAdd: ready || failed,
    total: ready ? base + added : null,
    onlyAdded: !ready && failed && added > 0 ? added : null,
  };
}
