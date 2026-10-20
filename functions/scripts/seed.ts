// Paciente fictícia nos emuladores: npm --prefix functions run seed
// (com os emuladores no ar, ou: firebase emulators:exec --only auth,firestore,storage --project demo-yune "npm --prefix functions run seed").
// Refaz sempre os mesmos documentos (mesmo uid e ids, PRNG com semente); nunca roda fora do emulador.
import { readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

// Só para o emulador (demo-yune). Login no app com emulador: este e-mail e esta senha.
const TEST_EMAIL = "paciente@yune.test";
const TEST_PASSWORD = "yune-teste-2026";
const UID = "seed-paciente";
const PROJECT = "demo-yune";
const TZ = "America/Sao_Paulo";
const TZ_OFFSET_H = 3; // São Paulo = UTC-3 (sem horário de verão)
const WEEKS = 8;
const JPEG_HEAD =
  "/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAEKADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAQAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMACQkJCQkJEAkJEBYQEBAWHhYWFhYeJh4eHh4eJi4mJiYmJiYuLi4uLi4uLjc3Nzc3N0BAQEBASEhISEhISEhISP/bAEMBCwwMEhESHxERH0szKjNLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS//dAAQAAf/aAAwDAQACEQMRAD8A";

for (const v of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_STORAGE_EMULATOR_HOST"]) {
  if (!process.env[v]) {
    console.error(`${v} não está definido: o seed só roda nos emuladores (firebase emulators:exec --only auth,firestore,storage --project ${PROJECT} ...).`);
    process.exit(1);
  }
}

initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
const db: Firestore = getFirestore();

// PRNG determinístico (mulberry32)
let state = 20261019;
const rnd = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a: number, b: number) => a + rnd() * (b - a);
const int = (a: number, b: number) => Math.round(between(a, b));
const r1 = (n: number) => Math.round(n * 10) / 10;

// Dias: hoje (data local de São Paulo) e os anteriores, como Date em 00:00 UTC só para fazer contas.
const todayKey = new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(new Date());
const dayOffset = (n: number) => new Date(Date.parse(`${todayKey}T00:00:00Z`) + n * 86_400_000);
const keyOf = (d: Date) => d.toISOString().slice(0, 10);
/** Horário local (hora decimal) de um dia → ISO em UTC. */
const at = (day: Date, hour: number) => new Date(day.getTime() + (hour + TZ_OFFSET_H) * 3_600_000).toISOString();
const noon = (key: string) => `${key}T12:00:00.000Z`;

// Comida: nomes e valores por 100 g vêm da TACO do app.
type Row = [number, string, number, number, number, number, number, number];
const taco = JSON.parse(readFileSync(new URL("../../src/data/taco.json", import.meta.url), "utf8")) as Row[];
const food = (name: string, grams: number) => {
  const r = taco.find((x) => x[1] === name);
  if (!r) throw new Error(`Alimento fora da TACO: ${name}`);
  const f = grams / 100;
  return { name, quantity: `${grams} g`, grams, kcal: Math.round(r[3] * f), protein_g: r1(r[4] * f), carbs_g: r1(r[5] * f), fat_g: r1(r[6] * f) };
};
const MEALS: { label: string; hour: number; items: [string, number][] }[] = [
  { label: "Café da manhã", hour: 7.5, items: [["Pão, aveia, forma", 50], ["Ovo, de galinha, inteiro, cozido/10minutos", 100], ["Mamão, Papaia, cru", 150]] },
  { label: "Almoço", hour: 12.5, items: [["Arroz, integral, cozido", 150], ["Feijão, carioca, cozido", 120], ["Carne, bovina, acém, sem gordura, cozido", 100], ["Alface, crespa, crua", 40], ["Tomate, com semente, cru", 60]] },
  { label: "Lanche", hour: 16, items: [["Maçã, Fuji, com casca, crua", 130], ["Iogurte, natural", 170]] },
  { label: "Jantar", hour: 19.5, items: [["Batata, doce, cozida", 150], ["Frango, caipira, inteiro, com pele, cozido", 110], ["Alface, crespa, crua", 40]] },
  { label: "Ceia", hour: 21.5, items: [["Banana, maçã, crua", 100], ["Queijo, minas, frescal", 40]] },
];

async function main() {
  // Auth: uma pessoa com e-mail verificado
  const auth = getAuth();
  try {
    await auth.updateUser(UID, { email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: true, displayName: "Paciente Teste" });
  } catch {
    await auth.createUser({ uid: UID, email: TEST_EMAIL, password: TEST_PASSWORD, emailVerified: true, displayName: "Paciente Teste" });
  }

  const user = db.doc(`users/${UID}`);
  await db.recursiveDelete(user); // recomeça do zero (se rodou em outro dia, não sobram datas antigas)
  await getStorage().bucket().deleteFiles({ prefix: `body-photos/${UID}/`, force: true });
  await getStorage().bucket().deleteFiles({ prefix: `health-docs/${UID}/`, force: true });
  await user.set({
    name: "Paciente Teste", sex: "f", birth_year: 1990, height_cm: 165, weight_kg: 71.8,
    kcal_goal: 1800, water_goal_ml: 2200, sleep_goal_min: 480, timezone: TZ,
  });

  const counts: Record<string, number> = {};
  let batch = db.batch();
  let pending = 0;
  const put = async (path: string, data: Record<string, unknown>) => {
    batch.set(db.doc(`users/${UID}/${path}`), data);
    counts[path.split("/")[0]!] = (counts[path.split("/")[0]!] ?? 0) + 1;
    if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  };

  const days = WEEKS * 7;
  for (let n = -(days - 1); n <= 0; n++) {
    const day = dayOffset(n);
    const k = keyOf(day);
    const over = rnd() < 0.15; // alguns dias passam da meta
    const count = over ? 5 : int(3, 4.49);
    for (const [i, m] of MEALS.slice(0, count === 3 ? 4 : count).entries()) {
      if (count === 3 && i === 2) continue; // 3 refeições: sem lanche
      const scale = (over ? 1.45 : 1) * between(0.85, 1.1);
      const items = m.items.map(([name, g]) => food(name, Math.round((g * scale) / 5) * 5));
      const sum = (key: "kcal" | "protein_g" | "carbs_g" | "fat_g") => items.reduce((s, it) => s + it[key], 0);
      await put(`meals/m-${k}-${i}`, {
        eaten_at: at(day, m.hour + between(-0.3, 0.3)), description: m.label, kcal: sum("kcal"),
        protein_g: r1(sum("protein_g")), carbs_g: r1(sum("carbs_g")), fat_g: r1(sum("fat_g")),
        items, source: "manual", place: "casa", photo_path: null,
      });
    }
    // água: 6 a 9 goles de 250/300 ml ao longo do dia
    const gulps = int(6, 9);
    for (let i = 0; i < gulps; i++) await put(`water/w-${k}-${i}`, { drank_at: at(day, 7 + (i * 14) / gulps + between(0, 0.5)), ml: rnd() < 0.5 ? 250 : 300 });
    // sono: dorme à noite anterior, acorda de manhã (pertence ao dia em que se acorda)
    await put(`sleep/s-${k}`, { bed_at: at(dayOffset(n - 1), 22.7 + between(-0.7, 1)), wake_at: at(day, 6.5 + between(-0.5, 0.7)) });
    // atividades: seg, qua e sáb
    const dow = day.getUTCDay();
    const plan = ({ 1: ["Caminhada", 40, "leve", 160], 3: ["Musculação", 55, "moderada", 280], 6: ["Corrida", 35, "intensa", 330] } as Record<number, [string, number, string, number]>)[dow];
    if (plan) await put(`activities/a-${k}`, { started_at: at(day, dow === 6 ? 8 : 18), kind: plan[0], duration_min: plan[1] + int(-5, 5), intensity: plan[2], kcal: plan[3] + int(-20, 20), note: null });
  }

  // Medidas semanais: 75,2 → 71,8 (9 pontos, o último é hoje)
  const points = WEEKS + 1;
  for (let i = 0; i < points; i++) {
    const day = dayOffset(-(WEEKS - i) * 7);
    const w = i === 0 ? 75.2 : i === points - 1 ? 71.8 : r1(75.2 - ((75.2 - 71.8) * i) / (points - 1) + between(-0.25, 0.25));
    await put(`measurements/me-${keyOf(day)}`, {
      measured_at: at(day, 7), weight_kg: w, waist_cm: i % 2 === 0 ? r1(82 - i * 0.4) : null, hip_cm: i % 2 === 0 ? r1(103 - i * 0.3) : null,
      neck_cm: null, source: "manual", created_at: at(day, 7),
    });
  }

  // Storage: JPEGs mínimos de uma cor só (cabeçalho comum + final de cada cor), só para ter o que mostrar
  const bucket = getStorage().bucket();
  const COLORS = { azul: "d6a28a2bd43ce3ffd9", verde: "ea28a28ae638cfffd9", rosa: "eae8a28a93d13fffd9" } as const;
  const upload = async (path: string, color: keyof typeof COLORS) => {
    await bucket.file(path).save(Buffer.concat([Buffer.from(JPEG_HEAD, "base64"), Buffer.from(COLORS[color], "hex")]), { contentType: "image/jpeg" });
    counts.arquivos = (counts.arquivos ?? 0) + 1;
    return path;
  };

  // Fotos de corpo: duas sessões (5 semanas atrás e 3 dias atrás), três poses cada
  const poses = ["frente", "lado", "costas"] as const;
  const sessions: [number, keyof typeof COLORS][] = [[-35, "azul"], [-3, "verde"]];
  for (const [n, color] of sessions) {
    const day = dayOffset(n);
    for (const pose of poses) {
      const path = await upload(`body-photos/${UID}/seed-${keyOf(day)}-${pose}.jpg`, color);
      await put(`body_photos/bp-${keyOf(day)}-${pose}`, { taken_at: at(day, 8), pose, path, created_at: at(day, 8) });
    }
  }

  // Bioimpedância: duas leituras da InBody (12/08 e 02/10) e uma da Tanita
  const inbody1 = await upload(`health-docs/${UID}/inbody-2026-08-12.jpg`, "rosa");
  const inbody2 = await upload(`health-docs/${UID}/inbody-2026-10-02.jpg`, "rosa");
  const bc = (id: string, date: string, device: string, file: string | null, v: Record<string, number | null>) =>
    put(`body_comp/${id}`, { measured_at: noon(date), device, file_path: file, ai: false, created_at: noon(date), ...v });
  await bc("bc-inbody-2026-08-12", "2026-08-12", "InBody 270", inbody1, { weight_kg: 74.6, fat_pct: 33.4, fat_kg: 24.9, muscle_kg: 24.1, lean_kg: 49.7, visceral: 9, bmr_kcal: 1362, water_l: 33.2, ecw_tbw: 0.389, phase_angle: 5.1 });
  await bc("bc-inbody-2026-10-02", "2026-10-02", "InBody 270", inbody2, { weight_kg: 72.3, fat_pct: 31.2, fat_kg: 22.6, muscle_kg: 24.6, lean_kg: 49.7, visceral: 8, bmr_kcal: 1374, water_l: 33.6, ecw_tbw: 0.383, phase_angle: 5.4 });
  await bc("bc-tanita-2026-09-14", "2026-09-14", "Tanita BC-601", null, { weight_kg: 73.4, fat_pct: 32.5, fat_kg: 23.9, muscle_kg: 47.3, lean_kg: null, visceral: 8, bmr_kcal: 1410, water_l: null, ecw_tbw: null, phase_angle: null });

  // Exames: uma coleta
  const lab = await upload(`health-docs/${UID}/exames-2026-10-05.jpg`, "azul");
  const res = (code: string, name: string, value: number | null, value_text: string, unit: string, ref_low: number | null, ref_high: number | null, ref_text: string) =>
    ({ code, name, value, value_text, unit, ref_low, ref_high, ref_text });
  await put("lab_reports/lab-2026-10-05", {
    collected_at: noon("2026-10-05"), lab: "Laboratório Exemplo", file_paths: [lab], ai: false, created_at: noon("2026-10-05"),
    results: [
      res("glicemia", "Glicemia de jejum", 92, "92", "mg/dL", 70, 99, "70 a 99"),
      res("insulina", "Insulina", 11.4, "11,4", "µUI/mL", 2.6, 24.9, "2,6 a 24,9"),
      res("ldl", "LDL", 142, "142", "mg/dL", null, 130, "< 130"),
      res("vitamina_d", "Vitamina D (25-OH)", 22, "22", "ng/mL", 30, 100, "30 a 100"),
      res("ferritina", "Ferritina", 18, "18", "ng/mL", 15, 150, "15 a 150"),
      res("pcr_us", "PCR ultrassensível", null, "<5", "mg/L", null, 5, "< 5"),
    ],
  });

  // Questionário: duas versões, em dias diferentes (a mais nova mexe em alguns campos)
  const base = {
    objetivo: { principal: "Perder peso", detalhe: "Quero emagrecer com saúde e ter mais energia no dia." },
    condicoes: { lista: ["Colesterol alto"], outras: "", historico_familiar: "Diabetes tipo 2 (avó), hipertensão (pai)." },
    medicamentos: { lista: "", glp1: "Não", glp1_qual: "" },
    suplementos: { lista: "Vitamina D 2000 UI" },
    alergias: { alergias: "", intolerancias: "Lactose (leve)", aversoes: "Fígado", preferencias: "Frutas, comida caseira" },
    intestino: { frequencia: "1x ao dia", bristol: 4 },
    rotina: { horas_sono: 7, estresse: 3, atividade_fisica: "3 a 4x por semana", alcool: "De vez em quando", tabagismo: "Nunca fumei" },
    ciclo: { regular: "Sim", anticoncepcional: "", menopausa: "Não" },
    peso: { maior_peso: 78, menor_peso: 62, dietas_anteriores: "Low carb por 3 meses em 2022.", cirurgias: "" },
    alimentacao: { horarios: "7h30, 12h30, 16h, 19h30", onde: "Em casa", quem_cozinha: "Eu mesma" },
  };
  await put(`anamnesis/${keyOf(dayOffset(-30))}`, { updated_at: at(dayOffset(-30), 20), answers: base });
  await put(`anamnesis/${keyOf(dayOffset(-2))}`, {
    updated_at: at(dayOffset(-2), 21),
    answers: { ...base, rotina: { ...base.rotina, estresse: 2, horas_sono: 7.5 }, suplementos: { lista: "Vitamina D 2000 UI, ferro quelato" } },
  });

  if (pending) await batch.commit();
  console.log(`Seed pronto (${PROJECT}, uid ${UID}, ${TEST_EMAIL}; senha em TEST_PASSWORD no topo de scripts/seed.ts).`);
  console.log(Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
