import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it, vi } from "vitest";
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, setLogLevel } from "firebase/firestore";
import { SECTIONS } from "../../src/lib/anamnesis";
import { DEFAULT_REMINDERS } from "../../src/lib/defaults";

// anamnesis.ts importa o app Firebase (init exige chave de API); SECTIONS é só dados.
vi.mock("../../src/lib/firebase", () => ({}));

let env: RulesTestEnvironment;
setLogLevel("silent");
const NOW = "2026-10-19T12:00:00.000Z";
const ID64 = "a".repeat(64);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yune",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8085 },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const alice = () => env.authenticatedContext("alice", { email_verified: true }).firestore();
const bob = () => env.authenticatedContext("bob", { email_verified: true }).firestore();
const seed = (path: string, data: object) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const push = (extra: object = {}) => ({
  endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh: "p", auth: "a", user_agent: "Chrome", created_at: NOW, ...extra,
});
const food = (extra: object = {}) => ({
  name: "Pão", serving_label: "1 fatia", serving_g: 25, kcal: 60, protein_g: 2, carbs_g: 11, fat_g: 1, created_at: NOW, ...extra,
});

describe("regras: dados", () => {
  it("push: aceita FCM, recusa outros hosts e campos ruins", async () => {
    await assertSucceeds(setDoc(doc(alice(), `users/alice/push_subscriptions/${ID64}`), push()));
    const bad = async (extra: object, id = ID64) => assertFails(setDoc(doc(alice(), `users/alice/push_subscriptions/${id}`), push(extra)));
    await bad({ endpoint: "https://attacker.example/collect" });
    await bad({ endpoint: "http://10.0.0.1/" });
    await bad({ endpoint: "https://fcm.googleapis.com.evil.example/x" });
    await bad({ endpoint: "https://fcm.googleapis.com@evil.example/x" });
    await bad({ user_agent: "x".repeat(600) });
    await bad({ created_at: 5 });
    await bad({}, "abc");
  });

  it("push: aceita endpoints realistas de Mozilla, Apple e WNS", async () => {
    const ok = async (endpoint: string, id: string) =>
      assertSucceeds(setDoc(doc(alice(), `users/alice/push_subscriptions/${id}`), push({ endpoint })));
    await ok("https://updates.push.services.mozilla.com/wpush/v2/gAAAAABk-token", "b".repeat(64));
    await ok("https://web.push.apple.com/QGxyz123token", "c".repeat(64));
    await ok("https://wns2-par02p.notify.windows.com/w/?token=BQYAAAAbc", "d".repeat(64));
  });

  it("reminders: push_details é booleano opcional", async () => {
    await assertSucceeds(setDoc(doc(alice(), "reminders/alice"), { ...DEFAULT_REMINDERS, push_details: true }));
    await assertFails(setDoc(doc(alice(), "reminders/alice"), { ...DEFAULT_REMINDERS, push_details: "sim" }));
    const semChave = Object.fromEntries(Object.entries(DEFAULT_REMINDERS).filter(([k]) => k !== "push_details"));
    await assertSucceeds(setDoc(doc(alice(), "reminders/alice"), semChave));
  });

  it("reminders: campos last_* são do servidor", async () => {
    await assertSucceeds(setDoc(doc(alice(), "reminders/alice"), DEFAULT_REMINDERS));
    await assertFails(setDoc(doc(alice(), "reminders/alice"), { ...DEFAULT_REMINDERS, last_water_at: NOW }));

    await seed("reminders/alice", { ...DEFAULT_REMINDERS, last_summary_date: "2026-10-18" });
    await assertSucceeds(updateDoc(doc(alice(), "reminders/alice"), { water_enabled: false }));
    await assertFails(updateDoc(doc(alice(), "reminders/alice"), { last_summary_date: "2026-10-19" }));
    await assertSucceeds(setDoc(doc(alice(), "reminders/alice"), DEFAULT_REMINDERS));
  });

  it("custom_foods exige created_at ISO", async () => {
    await assertSucceeds(setDoc(doc(alice(), "users/alice/custom_foods/f1"), food()));
    await assertFails(setDoc(doc(alice(), "users/alice/custom_foods/f2"), food({ created_at: { x: 1 } })));
  });

  it("anamnesis só aceita chaves de SECTIONS", async () => {
    for (const s of SECTIONS) {
      await assertSucceeds(setDoc(doc(alice(), "users/alice/anamnesis/2026-10-19"), { updated_at: NOW, answers: { [s.key]: {} } }));
    }
    await assertFails(setDoc(doc(alice(), "users/alice/anamnesis/2026-10-19"), { updated_at: NOW, answers: { outra: {} } }));
  });

  it("sem e-mail verificado ou sem login não lê nada", async () => {
    await seed("users/alice", { kcal_goal: 2000 });
    await seed("users/alice/meals/m1", { description: "x" });
    const unverified = env.authenticatedContext("alice", { email_verified: false }).firestore();
    const anon = env.unauthenticatedContext().firestore();
    for (const db of [unverified, anon]) {
      await assertFails(getDoc(doc(db, "users/alice")));
      await assertFails(getDocs(collection(db, "users/alice/meals")));
    }
  });

  it("coleções do servidor", async () => {
    await seed("entitlements/alice", { pro: true });
    await seed("ai_usage/alice_2026-10-19", { n: 1 });
    await seed("billing/alice", { customer: "c" });
    await assertFails(getDoc(doc(bob(), "entitlements/alice")));
    await assertFails(setDoc(doc(alice(), "entitlements/alice"), { pro: true }));
    await assertFails(getDoc(doc(alice(), "ai_usage/alice_2026-10-19")));
    await assertFails(setDoc(doc(alice(), "ai_usage/alice_2026-10-19"), { n: 0 }));
    await assertFails(getDoc(doc(alice(), "billing/alice")));

    await assertFails(setDoc(doc(alice(), "users/alice/diet_plans/p2"), { active: true }));
    await seed("users/alice/diet_plans/p1", { active: true, title: "t" });
    await assertSucceeds(updateDoc(doc(alice(), "users/alice/diet_plans/p1"), { active: false }));
    await assertFails(updateDoc(doc(alice(), "users/alice/diet_plans/p1"), { title: "x" }));
  });

  it("bob não lê nem cria em meals da alice", async () => {
    await seed("users/alice/meals/m1", { description: "x" });
    await assertFails(getDoc(doc(bob(), "users/alice/meals/m1")));
    await assertFails(setDoc(doc(bob(), "users/alice/meals/m2"), { description: "y" }));
  });
});
