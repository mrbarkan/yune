import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-yune",
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9199 },
  });
});
afterAll(() => env.cleanup());

const alice = () => env.authenticatedContext("alice", { email_verified: true }).storage();
const bob = () => env.authenticatedContext("bob", { email_verified: true }).storage();
const unverified = () => env.authenticatedContext("alice", { email_verified: false }).storage();
const put = (s: ReturnType<typeof alice>, path: string, bytes: number, contentType: string) =>
  uploadBytes(ref(s, path), new Uint8Array(bytes), { contentType });

describe("regras: storage", () => {
  it("imagem de 1 KB nas três pastas", async () => {
    for (const p of ["profile-photos/alice/a.jpg", "body-photos/alice/a.jpg", "health-docs/alice/a.jpg"]) {
      await assertSucceeds(put(alice(), p, 1024, "image/jpeg"));
    }
  });
  it("PDF só em health-docs", async () => {
    await assertSucceeds(put(alice(), "health-docs/alice/r.pdf", 1024, "application/pdf"));
    await assertFails(put(alice(), "body-photos/alice/r.pdf", 1024, "application/pdf"));
    await assertFails(put(alice(), "profile-photos/alice/r.pdf", 1024, "application/pdf"));
  });
  it("limites de tamanho", async () => {
    await assertFails(put(alice(), "body-photos/alice/big.jpg", 6 * 1024 * 1024, "image/jpeg"));
    await assertSucceeds(put(alice(), "health-docs/alice/big.pdf", 6 * 1024 * 1024, "application/pdf"));
    await assertFails(put(alice(), "health-docs/alice/huge.pdf", 11 * 1024 * 1024, "application/pdf"));
  });
  it("outra pessoa não lê nem envia", async () => {
    await assertFails(getBytes(ref(bob(), "body-photos/alice/a.jpg")));
    await assertFails(put(bob(), "body-photos/alice/b.jpg", 1024, "image/jpeg"));
    await assertSucceeds(getBytes(ref(alice(), "body-photos/alice/a.jpg")));
  });

  describe("e-mail não verificado", () => {
    const FOLDERS = ["meal-photos", "profile-photos", "body-photos", "health-docs", "diet-plans"];
    it("não envia, não lê e não apaga em nenhuma das cinco pastas", async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        for (const f of FOLDERS) await uploadBytes(ref(ctx.storage(), `${f}/alice/x.jpg`), new Uint8Array(16), { contentType: "image/jpeg" });
      });
      for (const f of FOLDERS) {
        await assertFails(put(unverified(), `${f}/alice/n.jpg`, 1024, "image/jpeg"));
        await assertFails(getBytes(ref(unverified(), `${f}/alice/x.jpg`)));
        await assertFails(deleteObject(ref(unverified(), `${f}/alice/x.jpg`)));
      }
    });
    it("verificado envia, lê e apaga nas cinco pastas", async () => {
      for (const f of FOLDERS) {
        await assertSucceeds(put(alice(), `${f}/alice/v.jpg`, 1024, "image/jpeg"));
        await assertSucceeds(getBytes(ref(alice(), `${f}/alice/v.jpg`)));
        await assertSucceeds(deleteObject(ref(alice(), `${f}/alice/v.jpg`)));
      }
    });
  });
});
