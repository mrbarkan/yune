import { getDoc, getDocs } from "firebase/firestore";
import { SECTIONS, type Anamnesis, type Value } from "./anamnesis";
import {
  auth, profileDoc, rows, table,
  type Activity, type BodyComp, type DietPlan, type LabReport, type Meal, type Measurement, type Profile, type Sleep, type Table, type Water,
} from "./firebase";
import { localDay } from "./photos";

export type ExportData = {
  profile: Profile; meals: Meal[]; water: Water[]; sleep: Sleep[]; activities: Activity[]; measurements: Measurement[];
  bodyComp: BodyComp[]; labs: LabReport[]; anamnesis: Anamnesis[]; diet: DietPlan[];
};
export type Cell = string | number | null;
export type ExportTable = { name: string; columns: string[]; rows: Cell[][] };

const all = async <T,>(name: Table) => rows<T>(await getDocs(table(name)));

/** Todos os documentos de cada coleção, sem filtro de data. Fotos do corpo (body_photos) nunca são lidas. */
export async function loadExportData(): Promise<ExportData> {
  const u = auth.currentUser;
  if (!u) throw new Error("Faça login para continuar.");
  const snap = await getDoc(profileDoc(u.uid));
  const profile = { ...snap.data(), id: u.uid } as Profile;
  const [meals, water, sleep, activities, measurements, bodyComp, labs, anamnesis, diet] = await Promise.all([
    all<Meal>("meals"), all<Water>("water"), all<Sleep>("sleep"), all<Activity>("activities"), all<Measurement>("measurements"),
    all<BodyComp>("body_comp"), all<LabReport>("lab_reports"), all<Anamnesis>("anamnesis"), all<DietPlan>("diet_plans"),
  ]);
  return { profile, meals, water, sleep, activities, measurements, bodyComp, labs, anamnesis, diet };
}

/** dd/mm/aaaa HH:mm no fuso da pessoa; vazio sem data. */
export function fmtLocal(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: tz || undefined, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export const exportFileName = (now: Date, tz: string) => `yune-dados-${localDay(now.toISOString(), tz)}`;

const byDate = <T,>(list: T[], at: (x: T) => string | null | undefined) => [...list].sort((a, b) => (at(a) ?? "").localeCompare(at(b) ?? ""));
const fmtValue = (v: Value | undefined) => (Array.isArray(v) ? v.join(", ") : v ?? "");
const answered = (v: Value | undefined) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null);

export function exportTables(d: ExportData, tz: string): ExportTable[] {
  const f = (iso: string | null | undefined) => fmtLocal(iso, tz);
  const p = d.profile;
  const latest = byDate(d.anamnesis, (a) => a.updated_at).at(-1);

  const quiz: Cell[][] = [];
  for (const s of SECTIONS) {
    for (const fd of s.fields) {
      const v = latest?.answers[s.key]?.[fd.key];
      if (answered(v)) quiz.push([s.title, fd.label, fmtValue(v)]);
    }
  }
  if (d.anamnesis.length) quiz.push(["Versões", "", byDate(d.anamnesis, (a) => a.updated_at).map((a) => f(a.updated_at).slice(0, 10)).join(", ")]);

  return [
    { name: "Perfil", columns: ["Campo", "Valor"], rows: [
      ["Nome", p.name], ["Sexo", p.sex === "f" ? "Feminino" : p.sex === "m" ? "Masculino" : null], ["Ano de nascimento", p.birth_year],
      ["Altura (cm)", p.height_cm], ["Peso (kg)", p.weight_kg], ["Meta de calorias (kcal)", p.kcal_goal],
      ["Meta de água (ml)", p.water_goal_ml], ["Meta de sono (min)", p.sleep_goal_min], ["Fuso horário", p.timezone],
    ] },
    { name: "Refeições", columns: ["Data", "Refeição", "Item", "Gramas", "kcal", "Proteína (g)", "Carboidrato (g)", "Gordura (g)"],
      rows: byDate(d.meals, (m) => m.eaten_at).flatMap((m): Cell[][] => m.items?.length
        ? m.items.map((it) => [f(m.eaten_at), m.description, it.name, it.grams, it.kcal, it.protein_g, it.carbs_g, it.fat_g])
        : [[f(m.eaten_at), m.description, m.description, null, m.kcal, m.protein_g, m.carbs_g, m.fat_g]]) },
    { name: "Água", columns: ["Data", "ml"], rows: byDate(d.water, (w) => w.drank_at).map((w) => [f(w.drank_at), w.ml]) },
    { name: "Sono", columns: ["Dormiu", "Acordou", "Duração (min)"],
      rows: byDate(d.sleep, (s) => s.bed_at).map((s) => [
        f(s.bed_at), f(s.wake_at), s.wake_at && s.bed_at ? Math.round((Date.parse(s.wake_at) - Date.parse(s.bed_at)) / 60_000) : null,
      ]) },
    { name: "Movimento", columns: ["Data", "Atividade", "Duração (min)", "Intensidade", "kcal", "Observação"],
      rows: byDate(d.activities, (a) => a.started_at).map((a) => [f(a.started_at), a.kind, a.duration_min, a.intensity, a.kcal, a.note]) },
    { name: "Medidas", columns: ["Data", "Peso (kg)", "Cintura (cm)", "Quadril (cm)", "Pescoço (cm)", "Origem"],
      rows: byDate(d.measurements, (m) => m.measured_at).map((m) => [
        f(m.measured_at), m.weight_kg, m.waist_cm, m.hip_cm, m.neck_cm, m.source === "body_comp" ? "Bioimpedância" : "Manual",
      ]) },
    { name: "Composição corporal", columns: [
      "Data", "Aparelho", "Peso (kg)", "Gordura (%)", "Gordura (kg)", "Músculo (kg)", "Massa magra (kg)", "Gordura visceral",
      "Metabolismo basal (kcal)", "Água (L)", "ECW/TBW", "Ângulo de fase"],
      rows: byDate(d.bodyComp, (b) => b.measured_at).map((b) => [
        f(b.measured_at), b.device, b.weight_kg, b.fat_pct, b.fat_kg, b.muscle_kg, b.lean_kg, b.visceral, b.bmr_kcal, b.water_l, b.ecw_tbw, b.phase_angle,
      ]) },
    { name: "Exames", columns: ["Coleta", "Laboratório", "Exame", "Valor", "Número", "Unidade", "Ref. mínima", "Ref. máxima", "Referência"],
      rows: byDate(d.labs, (l) => l.collected_at).flatMap((l) => (l.results ?? []).map((r): Cell[] => [
        f(l.collected_at), l.lab, r.name || r.code, r.value_text || (r.value == null ? "" : String(r.value)), r.value, r.unit, r.ref_low, r.ref_high, r.ref_text,
      ])) },
    { name: "Questionário", columns: ["Seção", "Pergunta", "Resposta"], rows: quiz },
    { name: "Dieta", columns: [
      "Título", "Prescritor", "Emitida em", "Ativa", "kcal", "Proteína (g)", "Carboidrato (g)", "Gordura (g)", "Fibra (g)", "Água (ml)"],
      rows: byDate(d.diet, (x) => x.created_at).map((x) => [
        x.title, x.prescriber, x.issued_on, x.active ? "Sim" : "Não",
        x.targets?.kcal, x.targets?.protein_g, x.targets?.carbs_g, x.targets?.fat_g, x.targets?.fiber_g, x.targets?.water_ml,
      ]) },
  ];
}

export async function downloadXlsx(tables: ExportTable[], fileName: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const sheets = tables.map((t) => ({
    sheet: t.name,
    data: [
      t.columns.map((c) => ({ value: c, fontWeight: "bold" as const })),
      ...t.rows.map((r) => r.map((c) => (c == null ? null : c))),
    ],
    columns: t.columns.map(() => ({ width: 18 })),
  }));
  await writeExcelFile(sheets).toFile(`${fileName}.xlsx`);
}

// A fonte padrão do PDF (Helvetica) cobre Latin-1 e pontuação comum; sinais de conta viram ASCII e o resto sai da página.
const ASCII: Record<string, string> = { "≤": "<=", "≥": ">=", "−": "-", "≠": "!=", "≈": "~", "→": "->", "⁄": "/" };
export const pdfText = (c: Cell) =>
  (c == null ? "" : typeof c === "number" && !Number.isInteger(c) ? c.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : String(c)).replace(/[≤≥−≠≈→⁄]/g, (m) => ASCII[m]).replace(/[^ -ÿ–—‘’“”•…]/g, "");

export async function downloadPdf(tables: ExportTable[], profile: Profile, fileName: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const today = fmtLocal(new Date().toISOString(), profile.timezone).slice(0, 10);
  doc.setFontSize(18);
  doc.text("Yune — meus dados", 14, 18);
  doc.setFontSize(10);
  doc.text(`${pdfText(profile.name || "")}${profile.name ? " · " : ""}exportado em ${today}`, 14, 25);
  let y = 33;
  for (const t of tables) {
    if (y > 180) { doc.addPage(); y = 18; }
    doc.setFontSize(13);
    doc.text(t.name, 14, y);
    if (!t.rows.length) {
      doc.setFontSize(9);
      doc.text("Sem registros.", 14, y + 6);
      y += 14;
      continue;
    }
    autoTable(doc, {
      startY: y + 3, head: [t.columns], body: t.rows.map((r) => r.map(pdfText)),
      styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [60, 60, 60] }, margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
  }
  doc.save(`${fileName}.pdf`);
}
