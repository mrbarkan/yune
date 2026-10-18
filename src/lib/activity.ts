/** Equivalentes metabólicos (Compendium of Physical Activities, valores médios). */
export const ACTIVITIES: { kind: string; met: number }[] = [
  { kind: "Caminhada", met: 3.5 },
  { kind: "Corrida", met: 9.8 },
  { kind: "Bicicleta", met: 7.5 },
  { kind: "Musculação", met: 5.0 },
  { kind: "Funcional", met: 8.0 },
  { kind: "Natação", met: 7.0 },
  { kind: "Pilates", met: 3.0 },
  { kind: "Yoga", met: 2.5 },
  { kind: "Dança", met: 5.5 },
  { kind: "Beach tennis", met: 7.0 },
  { kind: "Futebol", met: 7.0 },
  { kind: "Outro", met: 4.0 },
];

const FACTOR = { leve: 0.8, moderada: 1, intensa: 1.25 } as const;
export type Intensity = keyof typeof FACTOR;

export function estimateBurn(kind: string, minutes: number, intensity: Intensity, weightKg: number | null) {
  const met = ACTIVITIES.find((a) => a.kind === kind)?.met ?? 4;
  return Math.round(met * FACTOR[intensity] * (weightKg || 70) * (minutes / 60));
}

/** Meta sugerida: Mifflin-St Jeor × fator leve de atividade. */
export function suggestedGoal(p: { sex: "f" | "m" | null; birth_year: number | null; height_cm: number | null; weight_kg: number | null }) {
  if (!p.sex || !p.birth_year || !p.height_cm || !p.weight_kg) return null;
  const age = new Date().getFullYear() - p.birth_year;
  const bmr = 10 * p.weight_kg + 6.25 * p.height_cm - 5 * age + (p.sex === "m" ? 5 : -161);
  return Math.round((bmr * 1.375) / 10) * 10;
}
