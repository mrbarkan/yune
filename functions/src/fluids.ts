/** ml de bebida dos itens de uma refeição (`items[].ml`, gravado pelo app). Doc antigo ou malformado conta 0. */
export function mealDrinkMl(items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce<number>((s, it) => {
    const ml = (it as { ml?: unknown } | null)?.ml;
    return typeof ml === "number" && Number.isFinite(ml) && ml > 0 ? s + ml : s;
  }, 0);
}
