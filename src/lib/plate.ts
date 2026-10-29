/** Tamanhos do prato inteiro ("Repetir em outro tamanho"). */
export const SCALES = [0.5, 0.75, 1, 1.5, 2] as const;
export type Scale = (typeof SCALES)[number];

export const SCALE_LABEL: Record<Scale, string> = { 0.5: "½", 0.75: "¾", 1: "1", 1.5: "1½", 2: "2" };

/** Quantidades da escala `from` para `to`: 2 casas, nunca abaixo de 0,05. */
export const rescale = (qtys: number[], from: number, to: number) =>
  qtys.map((q) => Math.max(0.05, Math.round(((q * to) / from) * 100) / 100));
