import { addDoc, deleteDoc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { useCollection } from "./useCollection";
import { profileDoc, row, rows, table, type Measurement, type Profile } from "./firebase";

const DAY = 86_400_000;

export const useMeasurements = (version: number) => useCollection<Measurement>("measurements", "measured_at", version, "Não foi possível carregar as medidas.");

/** O peso do perfil acompanha a medida mais recente (pela data da medida); sem medidas, fica como está. */
export async function syncProfileWeight(profileId: string) {
  const snap = await getDocs(query(table("measurements"), orderBy("measured_at", "desc"), limit(1)));
  const newest = rows<Measurement>(snap)[0];
  if (newest) await updateDoc(profileDoc(profileId), { weight_kg: newest.weight_kg });
}

/** Depois de gravar: falha ao sincronizar vira aviso, não erro (tentar de novo duplicaria a medida). */
export async function syncWeightOrWarn(profileId: string, done: string) {
  try {
    await syncProfileWeight(profileId);
  } catch {
    return `${done}, mas não foi possível atualizar o peso do perfil.`;
  }
}

/** Variação do último peso contra a medida mais perto de 56 dias antes (janela de ±14 dias). */
export function changeSince(all: Measurement[]): { delta: number; days: number } | null {
  if (all.length < 2) return null;
  const sorted = [...all].sort((a, b) => a.measured_at.localeCompare(b.measured_at));
  const last = sorted[sorted.length - 1];
  const target = Date.parse(last.measured_at) - 56 * DAY;
  let best: Measurement | null = null;
  for (const x of sorted.slice(0, -1)) {
    const off = Math.abs(Date.parse(x.measured_at) - target);
    if (off <= 14 * DAY && (!best || off < Math.abs(Date.parse(best.measured_at) - target))) best = x;
  }
  if (!best) return null;
  return { delta: last.weight_kg - best.weight_kg, days: Math.round((Date.parse(last.measured_at) - Date.parse(best.measured_at)) / DAY) };
}

/**
 * Grava a medida (create: created_at = agora; edição: created_at fica como está) e alinha o peso do perfil
 * com a mais recente. Devolve um aviso se a medida foi gravada mas o perfil não.
 */
export async function saveMeasurement(m: Omit<Measurement, "id">, profile: Profile, id?: string) {
  const { created_at: _, ...data } = m;
  if (id) await updateDoc(row("measurements", id), data);
  else await addDoc(table("measurements"), { ...data, created_at: new Date().toISOString() });
  return syncWeightOrWarn(profile.id, "Medida salva");
}

export async function deleteMeasurement(id: string, profileId: string) {
  await deleteDoc(row("measurements", id));
  return syncWeightOrWarn(profileId, "Medida apagada");
}
