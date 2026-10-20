import { describe, expect, it } from "vitest";
import { checkDeleteRequest, deleteAccountStep, ignoring, REAUTH_SECONDS, STORAGE_PREFIXES, type DeleteDeps } from "./deleteAccount.js";

const NOW = 1_800_000_000;
const auth = (auth_time?: number) => ({ uid: "u1", token: { auth_time } });

describe("checkDeleteRequest", () => {
  it("exige login", () => {
    expect(checkDeleteRequest(undefined, { confirm: "APAGAR" }, NOW)).toEqual({ error: "Faça login para continuar." });
  });
  it("exige a palavra APAGAR", () => {
    expect(checkDeleteRequest(auth(NOW), { confirm: "apagar" }, NOW)).toEqual({ error: "Digite APAGAR para confirmar." });
    expect(checkDeleteRequest(auth(NOW), undefined, NOW)).toEqual({ error: "Digite APAGAR para confirmar." });
  });
  it("exige login recente (sem auth_time ou além de 600 s)", () => {
    const want = { error: "Por segurança, confirme seu acesso de novo.", reauth: true };
    expect(checkDeleteRequest(auth(undefined), { confirm: "APAGAR" }, NOW)).toEqual(want);
    expect(checkDeleteRequest(auth(NOW - REAUTH_SECONDS - 1), { confirm: "APAGAR" }, NOW)).toEqual(want);
  });
  it("aceita exatamente 600 s", () => {
    expect(checkDeleteRequest(auth(NOW - REAUTH_SECONDS), { confirm: "APAGAR" }, NOW)).toBeNull();
  });
  it("aceita login recente", () => {
    expect(checkDeleteRequest(auth(NOW - 5), { confirm: "APAGAR" }, NOW)).toBeNull();
  });
});

function deps(calls: string[], opts: { customer?: string | null; failCustomer?: boolean } = {}): DeleteDeps {
  return {
    customerId: async () => { calls.push("customerId"); return opts.customer === undefined ? "cus_1" : opts.customer; },
    deleteCustomer: async (id) => { calls.push(`deleteCustomer:${id}`); if (opts.failCustomer) throw new Error("stripe"); },
    deleteFiles: async (p) => { calls.push(`files:${p}`); },
    deleteDocs: async (uid) => { calls.push(`docs:${uid}`); },
    deleteUser: async (uid) => { calls.push(`user:${uid}`); },
  };
}

describe("deleteAccountStep", () => {
  it("segue a ordem: cliente, Stripe, arquivos, dados, usuário", async () => {
    const calls: string[] = [];
    await deleteAccountStep("u1", deps(calls));
    expect(calls).toEqual([
      "customerId", "deleteCustomer:cus_1",
      ...STORAGE_PREFIXES.map((p) => `files:${p}/u1/`),
      "docs:u1", "user:u1",
    ]);
  });
  it("se a Stripe falhar, nada é apagado", async () => {
    const calls: string[] = [];
    await expect(deleteAccountStep("u1", deps(calls, { failCustomer: true }))).rejects.toThrow("stripe");
    expect(calls).toEqual(["customerId", "deleteCustomer:cus_1"]);
  });
  it("sem cliente na Stripe, não chama deleteCustomer", async () => {
    const calls: string[] = [];
    await deleteAccountStep("u1", deps(calls, { customer: null }));
    expect(calls.some((c) => c.startsWith("deleteCustomer"))).toBe(false);
    expect(calls.at(-1)).toBe("user:u1");
  });
  it("cada prefixo termina com /uid/", async () => {
    const calls: string[] = [];
    await deleteAccountStep("abc", deps(calls));
    const files = calls.filter((c) => c.startsWith("files:"));
    expect(files).toHaveLength(STORAGE_PREFIXES.length);
    for (const f of files) expect(f).toMatch(/\/abc\/$/);
  });
});

describe("ignoring", () => {
  it("engole só o código esperado", async () => {
    await expect(ignoring("resource_missing", async () => { throw { code: "resource_missing" }; })).resolves.toBeUndefined();
    await expect(ignoring("resource_missing", async () => { throw { code: "other" }; })).rejects.toEqual({ code: "other" });
    await expect(ignoring("x", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    await expect(ignoring("x", async () => 1)).resolves.toBeUndefined();
  });
});
