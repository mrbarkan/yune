/** Nome da refeição pelo horário local: café 5–11, almoço 11–15, lanche 15–18, jantar 18–23, ceia no resto. */
export const mealName = (d: Date) => {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "Café da manhã";
  if (h < 15 && h >= 11) return "Almoço";
  if (h < 18 && h >= 15) return "Lanche";
  if (h < 23 && h >= 18) return "Jantar";
  return "Ceia";
};
