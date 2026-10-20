import { useEffect, useState } from "react";
import { deleteDoc, getDocs, orderBy, query } from "firebase/firestore";
import { deleteObject, getBlob, ref, uploadBytes } from "firebase/storage";
import { auth, row, rows, storage, table, type BodyComp, type BodyCompValues } from "./firebase";
import { compressImage } from "./image";
import { parseDecimal } from "./num";

export function useBodyComp(version: number) {
  const [list, setList] = useState<BodyComp[]>([]);
  useEffect(() => {
    let alive = true;
    getDocs(query(table("body_comp"), orderBy("measured_at")))
      .then((snap) => alive && setList(rows<BodyComp>(snap)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [version]);
  return list;
}

/** Faixas aceitas pelo servidor; campo vazio vai como null (0 é recusado). */
export const FIELDS: { key: keyof BodyCompValues; label: string; unit: string; min: number; max: number }[] = [
  { key: "weight_kg", label: "Peso", unit: "kg", min: 20, max: 400 },
  { key: "fat_pct", label: "Gordura corporal", unit: "%", min: 2, max: 75 },
  { key: "fat_kg", label: "Massa de gordura", unit: "kg", min: 1, max: 200 },
  { key: "muscle_kg", label: "Massa muscular esquelética", unit: "kg", min: 1, max: 200 },
  { key: "lean_kg", label: "Massa magra", unit: "kg", min: 1, max: 200 },
  { key: "visceral", label: "Gordura visceral", unit: "", min: 1, max: 60 },
  { key: "bmr_kcal", label: "Taxa metabólica basal", unit: "kcal", min: 500, max: 5000 },
  { key: "water_l", label: "Água corporal", unit: "L", min: 5, max: 100 },
  { key: "ecw_tbw", label: "ECW/TBW", unit: "", min: 0.2, max: 0.6 },
  { key: "phase_angle", label: "Ângulo de fase", unit: "°", min: 1, max: 20 },
];

/** Texto dos campos → valores. Vazio = null; texto ilegível ou fora da faixa → mensagem. */
export function parseValues(text: Partial<Record<keyof BodyCompValues, string>>): { values: BodyCompValues } | { error: string } {
  const values = {} as BodyCompValues;
  for (const f of FIELDS) {
    const s = (text[f.key] ?? "").trim();
    if (!s) {
      values[f.key] = null;
      continue;
    }
    const n = parseDecimal(s);
    if (n == null) return { error: `${f.label}: confira o número.` };
    if (n < f.min || n > f.max) {
      const fmt = (x: number) => x.toLocaleString("pt-BR");
      return { error: `${f.label}: entre ${fmt(f.min)} e ${fmt(f.max)}${f.unit ? ` ${f.unit}` : ""}.` };
    }
    values[f.key] = n;
  }
  return { values };
}

/** Sobe o laudo (PDF como está; foto reduzida) com nome novo — as regras não deixam sobrescrever. Devolve o caminho. */
export async function uploadHealthFile(file: File): Promise<string> {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login para continuar.");
  const pdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (!pdf && !file.type.startsWith("image/")) throw new Error("Use PDF ou foto.");
  const blob = pdf ? file : (await compressImage(file, 2400, 0.9)).blob;
  if (blob.size > 10 * 1024 * 1024) throw new Error("Arquivo grande demais (máx. 10 MB).");
  const path = `health-docs/${u.uid}/${crypto.randomUUID()}.${pdf ? "pdf" : "jpg"}`;
  await uploadBytes(ref(storage, path), blob, { contentType: pdf ? "application/pdf" : "image/jpeg" });
  return path;
}

/** Apaga um arquivo do Storage; arquivo que já não existe não é erro (tentar de novo funciona). */
export async function deleteHealthFile(path: string) {
  try {
    await deleteObject(ref(storage, path));
  } catch (e) {
    if ((e as { code?: string }).code !== "storage/object-not-found") throw e;
  }
}

/** Apaga o arquivo e depois o registro. */
export async function deleteBodyComp(b: BodyComp) {
  if (b.file_path) await deleteHealthFile(b.file_path);
  await deleteDoc(row("body_comp", b.id));
}

/** Abre o arquivo em outra aba, sem URL pública: baixa como blob e abre um endereço local. */
export async function openHealthFile(path: string) {
  const w = window.open("about:blank", "_blank"); // abre já, no toque, para o navegador não bloquear
  try {
    const url = URL.createObjectURL(await getBlob(ref(storage, path)));
    if (w) w.location.href = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
}

const f1 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}${f1(Math.abs(n))}`;

/** "−3,1 kg gordura · −0,3 kg músculo" — só variação, sem interpretação. */
export function deltaText(d: { fat_kg: number | null; muscle_kg: number | null; muscle_field: "muscle_kg" | "lean_kg" | null }) {
  return [
    d.fat_kg != null && `${signed(d.fat_kg)} kg gordura`,
    d.muscle_kg != null && `${signed(d.muscle_kg)} kg ${d.muscle_field === "lean_kg" ? "massa magra" : "músculo"}`,
  ].filter(Boolean).join(" · ");
}
