import { useEffect, useState } from "react";
import { addDoc, deleteDoc, getDocs, orderBy, query, updateDoc } from "firebase/firestore";
import { profileDoc, row, rows, table, type Measurement, type Profile } from "./firebase";

const DAY = 86_400_000;

export function useMeasurements(version: number) {
  const [list, setList] = useState<Measurement[]>([]);
  useEffect(() => {
    let alive = true;
    getDocs(query(table("measurements"), orderBy("measured_at")))
      .then((snap) => alive && setList(rows<Measurement>(snap)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [version]);
  return list;
}

/** O peso do perfil acompanha a medida mais recente; lançamento com data antiga não mexe nele. */
export function shouldUpdateWeight(all: Measurement[], saved: Measurement) {
  return all.every((x) => x.id === saved.id || x.measured_at <= saved.measured_at);
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
 * Grava a medida (create: created_at = agora; edição: created_at fica como está) e, se for a mais
 * recente, atualiza o peso do perfil. Nota: `profile` vem antes de `id?` porque o TS não aceita
 * parâmetro obrigatório depois de opcional.
 */
export async function saveMeasurement(m: Omit<Measurement, "id">, profile: Profile, id?: string, all: Measurement[] = []) {
  const { created_at: _, ...data } = m;
  let savedId = id;
  if (id) await updateDoc(row("measurements", id), data);
  else savedId = (await addDoc(table("measurements"), { ...data, created_at: new Date().toISOString() })).id;
  const saved = { ...m, id: savedId! };
  if (shouldUpdateWeight(all.filter((x) => x.id !== savedId), saved)) {
    await updateDoc(profileDoc(profile.id), { weight_kg: m.weight_kg });
  }
}

export async function deleteMeasurement(id: string) {
  await deleteDoc(row("measurements", id));
}
