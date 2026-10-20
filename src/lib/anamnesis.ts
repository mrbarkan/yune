import { useEffect, useState } from "react";
import { getDocs, limit, orderBy, query, setDoc } from "firebase/firestore";
import { row, rows, table, type Profile, type Sleep } from "./firebase";
import { localDay } from "./photos";

export type FieldKind = "text" | "longtext" | "choice" | "multi" | "number" | "scale" | "bristol";
export type FieldDef = { key: string; label: string; kind: FieldKind; options?: string[]; min?: number; max?: number };
export type SectionKey =
  | "objetivo" | "condicoes" | "medicamentos" | "suplementos" | "alergias"
  | "intestino" | "rotina" | "ciclo" | "peso" | "alimentacao";
export type SectionDef = { key: SectionKey; title: string; fields: FieldDef[]; when?: (p: Profile) => boolean };

export type Value = string | number | string[] | null;
export type Answers = Partial<Record<SectionKey, Record<string, Value>>>;
export type Anamnesis = { id: string; updated_at: string; answers: Answers };

/** Escala de Bristol (1–7), descrição curta de cada tipo. */
export const BRISTOL = [
  "Tipo 1 — bolinhas duras e separadas, difíceis de sair",
  "Tipo 2 — em formato de salsicha, mas encaroçado",
  "Tipo 3 — salsicha com rachaduras na superfície",
  "Tipo 4 — salsicha lisa e macia (o ideal)",
  "Tipo 5 — pedaços macios com bordas nítidas, saem fácil",
  "Tipo 6 — pedaços moles e pastosos, sem forma definida",
  "Tipo 7 — líquido, sem pedaços sólidos",
];

export const SECTIONS: SectionDef[] = [
  { key: "objetivo", title: "Objetivo", fields: [
    { key: "principal", label: "Seu principal objetivo", kind: "choice",
      options: ["Perder peso", "Ganhar massa", "Controlar uma condição de saúde", "Comer melhor", "Ter mais energia", "Outro"] },
    { key: "detalhe", label: "Conte mais (queixas, o que gostaria de mudar)", kind: "longtext" },
  ] },
  { key: "condicoes", title: "Condições de saúde", fields: [
    { key: "lista", label: "Você tem ou já teve", kind: "multi",
      options: ["Diabetes", "Hipertensão", "Colesterol alto", "Tireoide", "SOP", "Outras"] },
    { key: "outras", label: "Outras condições", kind: "text" },
    { key: "historico_familiar", label: "Histórico familiar (doenças na família)", kind: "longtext" },
  ] },
  { key: "medicamentos", title: "Medicamentos", fields: [
    { key: "lista", label: "Medicamentos que usa (nome e dose)", kind: "longtext" },
    { key: "glp1", label: "Usa remédio para emagrecer (Ozempic, Mounjaro, etc.)?", kind: "choice", options: ["Sim", "Não"] },
    { key: "glp1_qual", label: "Qual e dose", kind: "text" },
  ] },
  { key: "suplementos", title: "Suplementos", fields: [
    { key: "lista", label: "Suplementos em uso", kind: "longtext" },
  ] },
  { key: "alergias", title: "Alergias e preferências", fields: [
    { key: "alergias", label: "Alergias", kind: "text" },
    { key: "intolerancias", label: "Intolerâncias", kind: "text" },
    { key: "aversoes", label: "Aversões (o que não come)", kind: "text" },
    { key: "preferencias", label: "Preferências (o que gosta)", kind: "text" },
  ] },
  { key: "intestino", title: "Intestino", fields: [
    { key: "frequencia", label: "Com que frequência vai ao banheiro", kind: "choice",
      options: ["Mais de 1x ao dia", "1x ao dia", "Dia sim, dia não", "2 a 3x por semana", "Menos de 2x por semana"] },
    { key: "bristol", label: "Tipo mais comum (escala de Bristol)", kind: "bristol", min: 1, max: 7 },
  ] },
  { key: "rotina", title: "Rotina", fields: [
    { key: "horas_sono", label: "Horas de sono por noite", kind: "number", min: 0, max: 24 },
    { key: "estresse", label: "Nível de estresse (1 calmo, 5 muito alto)", kind: "scale", min: 1, max: 5 },
    { key: "atividade_fisica", label: "Atividade física", kind: "choice",
      options: ["Não pratico", "1 a 2x por semana", "3 a 4x por semana", "5x ou mais por semana"] },
    { key: "alcool", label: "Álcool", kind: "choice", options: ["Não bebo", "De vez em quando", "Toda semana", "Todo dia"] },
    { key: "tabagismo", label: "Tabagismo", kind: "choice", options: ["Nunca fumei", "Ex-fumante", "Fumo"] },
  ] },
  { key: "ciclo", title: "Ciclo menstrual", when: (p) => p.sex === "f", fields: [
    { key: "regular", label: "O ciclo é regular?", kind: "choice", options: ["Sim", "Não", "Não sei"] },
    { key: "anticoncepcional", label: "Método contraceptivo", kind: "text" },
    { key: "menopausa", label: "Menopausa", kind: "choice", options: ["Não", "Perimenopausa", "Sim"] },
  ] },
  { key: "peso", title: "Histórico de peso", fields: [
    { key: "maior_peso", label: "Maior peso adulto (kg)", kind: "number", min: 0, max: 400 },
    { key: "menor_peso", label: "Menor peso adulto (kg)", kind: "number", min: 0, max: 400 },
    { key: "dietas_anteriores", label: "Dietas anteriores", kind: "longtext" },
    { key: "cirurgias", label: "Cirurgias", kind: "longtext" },
  ] },
  { key: "alimentacao", title: "Rotina alimentar", fields: [
    { key: "horarios", label: "Horários das refeições", kind: "text" },
    { key: "onde", label: "Onde costuma comer", kind: "text" },
    { key: "quem_cozinha", label: "Quem cozinha", kind: "text" },
  ] },
];

/** Dia local (AAAA-MM-DD) no fuso da pessoa. */
export const dayKey = (d: Date, tz: string) => localDay(d.toISOString(), tz);

const filled = (v: Value | undefined) =>
  v == null ? false : Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : true;

export const visibleSections = (p: Profile) => SECTIONS.filter((s) => !s.when || s.when(p));

export const sectionDone = (a: Answers, key: SectionKey) => Object.values(a[key] ?? {}).some(filled);

/** Porcentagem (0–100) de seções visíveis com alguma resposta. */
export function completion(a: Answers, p: Profile): number {
  const vis = visibleSections(p);
  if (!vis.length) return 0;
  return Math.round((100 * vis.filter((s) => sectionDone(a, s.key)).length) / vis.length);
}

/** Média de horas dormidas nas noites encerradas dos últimos 14 dias; null sem registros. */
export function avgSleepHours(list: Sleep[], now: Date): number | null {
  const from = now.getTime() - 14 * 86_400_000;
  const mins = list
    .filter((s) => s.wake_at && Date.parse(s.wake_at) >= from)
    .map((s) => (Date.parse(s.wake_at!) - Date.parse(s.bed_at)) / 60_000)
    .filter((m) => m > 0);
  if (!mins.length) return null;
  return Math.round((mins.reduce((a, b) => a + b, 0) / mins.length / 60) * 10) / 10;
}

/** Versão mais recente do questionário (null se nunca preenchido). */
export function useLatestAnamnesis(version: number): { latest: Anamnesis | null; loaded: boolean } {
  const [state, setState] = useState<{ latest: Anamnesis | null; loaded: boolean }>({ latest: null, loaded: false });
  useEffect(() => {
    let alive = true;
    getDocs(query(table("anamnesis"), orderBy("updated_at", "desc"), limit(1)))
      .then((snap) => alive && setState({ latest: rows<Anamnesis>(snap)[0] ?? null, loaded: true }))
      .catch(() => alive && setState((s) => ({ ...s, loaded: true })));
    return () => {
      alive = false;
    };
  }, [version]);
  return state;
}

/** Grava o questionário inteiro no documento do dia: no mesmo dia sobrescreve, em outro dia cria nova versão. */
export async function saveAnswers(answers: Answers, now: Date, tz: string) {
  await setDoc(row("anamnesis", dayKey(now, tz)), { updated_at: now.toISOString(), answers });
}
