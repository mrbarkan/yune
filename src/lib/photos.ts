import { useEffect, useState } from "react";
import { addDoc, deleteDoc, getDocs, orderBy, query } from "firebase/firestore";
import { deleteObject, ref, uploadBytes } from "firebase/storage";
import { auth, row, rows, storage, table, type BodyPhoto, type Measurement, type Pose } from "./firebase";
import { compressImage } from "./image";

const DAY = 86_400_000;

export function useBodyPhotos(version: number) {
  const [list, setList] = useState<BodyPhoto[]>([]);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    getDocs(query(table("body_photos"), orderBy("taken_at")))
      .then((snap) => {
        if (!alive) return;
        setList(rows<BodyPhoto>(snap));
        setErr("");
      })
      .catch(() => alive && setErr("Não foi possível carregar as fotos."));
    return () => {
      alive = false;
    };
  }, [version]);
  return { list, err };
}

/** Sobe o arquivo (nome novo: as regras não deixam sobrescrever) e cria o registro; se o registro falhar, apaga o arquivo. */
export async function addBodyPhoto(pose: Pose, file: File, takenAt: Date) {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login para continuar.");
  const { blob } = await compressImage(file, 1600, 0.85);
  const path = `body-photos/${u.uid}/${crypto.randomUUID()}.jpg`;
  await uploadBytes(ref(storage, path), blob, { contentType: "image/jpeg" });
  try {
    await addDoc(table("body_photos"), { taken_at: takenAt.toISOString(), pose, path, created_at: new Date().toISOString() });
  } catch (e) {
    await deleteObject(ref(storage, path)).catch(() => {});
    throw e;
  }
}

/** Apaga o arquivo e depois o registro (arquivo que já não existe não é erro; assim tentar de novo funciona). */
export async function deleteBodyPhoto(p: BodyPhoto) {
  try {
    await deleteObject(ref(storage, p.path));
  } catch (e) {
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
  await deleteDoc(row("body_photos", p.id));
}

export const localDay = (iso: string, tz: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: tz });

/** Sessões por dia local (YYYY-MM-DD), da mais nova para a mais antiga, com a última foto de cada pose. */
export function sessions(photos: BodyPhoto[], tz: string) {
  const days = new Map<string, Partial<Record<Pose, BodyPhoto>>>();
  for (const p of photos) {
    const day = localDay(p.taken_at, tz);
    const cur = days.get(day) ?? {};
    const prev = cur[p.pose];
    if (!prev || prev.taken_at < p.taken_at) cur[p.pose] = p;
    days.set(day, cur);
  }
  return [...days.entries()]
    .map(([day, photos]) => ({ day, photos }))
    .sort((a, b) => b.day.localeCompare(a.day));
}

/** Medida mais perto do dia (YYYY-MM-DD), só se estiver a até 3 dias. */
export function nearestMeasurement(list: Measurement[], day: string): Measurement | null {
  const t = Date.parse(`${day}T12:00:00Z`);
  let best: Measurement | null = null;
  let bestOff = Infinity;
  for (const m of list) {
    const off = Math.abs(Date.parse(m.measured_at) - t);
    if (off < bestOff) {
      best = m;
      bestOff = off;
    }
  }
  return best && bestOff <= 3 * DAY ? best : null;
}

/** Variação de peso e cintura entre duas medidas; sem variação quando falta uma ou é a mesma medida. */
export function compareChange(a: Measurement | null, b: Measurement | null): { weight: number | null; waist: number | null } | null {
  if (!a || !b || a.id === b.id) return null;
  const weight = b.weight_kg - a.weight_kg;
  const waist = a.waist_cm != null && b.waist_cm != null ? b.waist_cm - a.waist_cm : null;
  return { weight, waist };
}
