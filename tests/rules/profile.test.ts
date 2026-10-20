import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { deleteDoc, doc, getDoc, setDoc, setLogLevel } from "firebase/firestore";

let env: RulesTestEnvironment;
setLogLevel("silent"); // negações esperadas não precisam poluir a saída
const NOW = "2026-10-19T12:00:00.000Z";

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yune",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const seed = (path: string, data: object) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const alice = () => env.authenticatedContext("alice", { email_verified: true }).firestore();
const bob = () => env.authenticatedContext("bob", { email_verified: true }).firestore();

const profile = (extra: object = {}) => ({ kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480, timezone: "America/Sao_Paulo", ...extra });
const measurement = (extra: object = {}) => ({
  measured_at: NOW, weight_kg: 71.8, waist_cm: 82, hip_cm: null, neck_cm: null, source: "manual", created_at: NOW, ...extra,
});
const bodyPhoto = (extra: object = {}) => ({ taken_at: NOW, pose: "frente", path: "body-photos/alice/a.jpg", created_at: NOW, ...extra });

describe("regras: perfil", () => {
  it("photo_path só na pasta da própria pessoa", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile({ photo_path: "profile-photos/alice/x.jpg" })));
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile({ photo_path: null })));
    await assertFails(setDoc(doc(alice(), "users/alice"), profile({ photo_path: "profile-photos/bob/x.jpg" })));
  });
});

describe("regras: ai_consent no perfil", () => {
  const ok = { at: NOW, version: 1 };
  it("aceita consentimento válido, null e ausente", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: ok })));
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: null })));
    await assertSucceeds(setDoc(doc(alice(), "users/alice"), profile()));
  });
  it("nega chave extra, data fora do ISO e versão inválida", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: { ...ok, extra: 1 } })));
    await assertFails(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: { at: "ontem", version: 1 } })));
    await assertFails(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: { at: NOW, version: "1" } })));
    await assertFails(setDoc(doc(alice(), "users/alice"), profile({ ai_consent: { at: NOW, version: 0 } })));
  });
});

describe("regras: measurements", () => {
  it("cria válida, rejeita faixa, chave extra e created_at ausente", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/measurements/m1"), measurement()));
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m2"), measurement({ weight_kg: 10 })));
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m2"), measurement({ waist_cm: 20 })));
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m2"), measurement({ extra: 1 })));
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m2"), measurement({ source: "x" })));
    const { created_at, ...semCriado } = measurement();
    void created_at;
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m2"), semCriado));
  });
  it("campos opcionais podem faltar", async () => {
    const { hip_cm, neck_cm, waist_cm, ...min } = measurement();
    void hip_cm; void neck_cm; void waist_cm;
    await assertSucceeds(setDoc(doc(alice(), "users/alice/measurements/m3"), min));
  });
  it("edição mantém created_at", async () => {
    await seed("users/alice/measurements/m1", measurement());
    await assertSucceeds(setDoc(doc(alice(), "users/alice/measurements/m1"), measurement({ weight_kg: 70 })));
    await assertFails(setDoc(doc(alice(), "users/alice/measurements/m1"), measurement({ created_at: "2026-10-20T12:00:00.000Z" })));
  });
  it("outra pessoa não lê nem escreve", async () => {
    await seed("users/alice/measurements/m1", measurement());
    await assertFails(getDoc(doc(bob(), "users/alice/measurements/m1")));
    await assertFails(setDoc(doc(bob(), "users/alice/measurements/m9"), measurement()));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/measurements/m1")));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/measurements/m1")));
  });
});

describe("regras: body_photos", () => {
  it("cria válida; pose e caminho inválidos falham", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/body_photos/p1"), bodyPhoto()));
    await assertFails(setDoc(doc(alice(), "users/alice/body_photos/p2"), bodyPhoto({ pose: "x" })));
    await assertFails(setDoc(doc(alice(), "users/alice/body_photos/p2"), bodyPhoto({ path: "meal-photos/alice/a.jpg" })));
    await assertFails(setDoc(doc(alice(), "users/alice/body_photos/p2"), bodyPhoto({ path: "body-photos/bob/a.jpg" })));
    await assertFails(setDoc(doc(alice(), "users/alice/body_photos/p2"), bodyPhoto({ extra: 1 })));
  });
  it("não edita; lê e apaga só a dona", async () => {
    await seed("users/alice/body_photos/p1", bodyPhoto());
    await assertFails(setDoc(doc(alice(), "users/alice/body_photos/p1"), bodyPhoto({ pose: "lado" })));
    await assertFails(getDoc(doc(bob(), "users/alice/body_photos/p1")));
    await assertFails(deleteDoc(doc(bob(), "users/alice/body_photos/p1")));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/body_photos/p1")));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/body_photos/p1")));
  });
});

describe("regras: anamnesis", () => {
  it("id de data e answers em mapa", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/anamnesis/2026-10-19"), { updated_at: NOW, answers: { objetivo: { principal: "Comer melhor" }, medicamentos: { lista: "a" } } }));
    await assertFails(setDoc(doc(alice(), "users/alice/anamnesis/hoje"), { updated_at: NOW, answers: {} }));
    await assertFails(setDoc(doc(alice(), "users/alice/anamnesis/2026-10-20"), { updated_at: NOW, answers: "x" }));
    await assertFails(setDoc(doc(alice(), "users/alice/anamnesis/2026-10-20"), { updated_at: NOW, answers: {}, extra: 1 }));
    await assertFails(getDoc(doc(bob(), "users/alice/anamnesis/2026-10-19")));
    await assertSucceeds(getDoc(doc(alice(), "users/alice/anamnesis/2026-10-19")));
    await assertSucceeds(deleteDoc(doc(alice(), "users/alice/anamnesis/2026-10-19")));
  });
});

describe("regras: body_comp e lab_reports (só servidor escreve)", () => {
  for (const col of ["body_comp", "lab_reports"]) {
    it(`${col}: cliente não cria nem edita; lê e apaga`, async () => {
      await seed(`users/alice/${col}/s1`, { measured_at: NOW });
      await assertFails(setDoc(doc(alice(), `users/alice/${col}/n1`), { measured_at: NOW }));
      await assertFails(setDoc(doc(alice(), `users/alice/${col}/s1`), { measured_at: NOW, x: 1 }));
      await assertFails(getDoc(doc(bob(), `users/alice/${col}/s1`)));
      await assertSucceeds(getDoc(doc(alice(), `users/alice/${col}/s1`)));
      await assertSucceeds(deleteDoc(doc(alice(), `users/alice/${col}/s1`)));
    });
  }
});

describe("regras: billing e entitlements", () => {
  it("billing sem acesso do cliente; entitlements só leitura", async () => {
    await seed("billing/alice", { customer: "c" });
    await assertFails(getDoc(doc(alice(), "billing/alice")));
    await assertFails(setDoc(doc(alice(), "billing/alice"), { customer: "x" }));
    await assertFails(setDoc(doc(alice(), "entitlements/alice"), { pro: true }));
  });
});
