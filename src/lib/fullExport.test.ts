import { describe, expect, it, vi } from "vitest";
const reads: string[] = [];
vi.mock("firebase/firestore", () => ({
  getDoc: async () => ({ exists: () => false, data: () => ({ photo_path: "profile-photos/u1/p.jpg" }) }),
  getDocs: async (name: string) => ({ docs: name === "meals" ? [{ id: "m1", data: () => ({ photo_path: "meal-photos/u1/ok.jpg" }) }, { id: "m2", data: () => ({ photo_path: "meal-photos/u1/bad.jpg" }) }] : [] }),
}));
vi.mock("firebase/storage", () => ({
  ref: (_s: unknown, p: string) => p,
  getBlob: async (p: string) => { if (p.includes("bad")) throw new Error("x"); return new Blob(["a"]); },
}));
vi.mock("./firebase", () => ({
  auth: { currentUser: { uid: "u1" } }, storage: {},
  profileDoc: () => "profile", remindersDoc: () => "rem", entitlementsDoc: () => "ent",
  table: (n: string) => { reads.push(n); return n; },
  rows: (snap: { docs: { id: string; data: () => object }[] }) => snap.docs.map((d) => ({ ...d.data(), id: d.id })),
}));
import { downloadAll, filePaths, manifest, zipFileName, zipName, type FullData } from "./fullExport";

const uid = "u1";
const data = (c: FullData["collections"], profile: Record<string, unknown> = {}): FullData => ({ profile, reminders: null, entitlements: null, collections: c });

describe("fullExport", () => {
  it("filePaths junta os caminhos válidos, sem repetir, ordenados", () => {
    const d = data({
      meals: [{ photo_path: "meal-photos/u1/b.jpg" }, { photo_path: "meal-photos/u1/b.jpg" }, { photo_path: null }],
      body_comp: [{ file_path: "health-docs/u1/a.pdf" }],
      lab_reports: [{ file_paths: ["health-docs/u1/c.pdf", "health-docs/u1/a.pdf"] }],
      diet_plans: [{ file_path: "diet-plans/u1/d.pdf" }],
    }, { photo_path: "profile-photos/u1/p.jpg" });
    expect(filePaths(d, uid, false)).toEqual([
      "diet-plans/u1/d.pdf", "health-docs/u1/a.pdf", "health-docs/u1/c.pdf", "meal-photos/u1/b.jpg", "profile-photos/u1/p.jpg",
    ]);
  });

  it("filePaths descarta outro uid, .. e caminhos aninhados", () => {
    const d = data({
      meals: [
        { photo_path: "meal-photos/u2/x.jpg" }, { photo_path: "meal-photos/u1/../u2/x.jpg" },
        { photo_path: "meal-photos/u1/sub/x.jpg" }, { photo_path: "other/u1/x.jpg" }, { photo_path: "meal-photos/u1/ok.jpg" },
      ],
    });
    expect(filePaths(d, uid, false)).toEqual(["meal-photos/u1/ok.jpg"]);
  });

  it("filePaths só traz fotos do corpo com a opção", () => {
    const d = data({ body_photos: [{ path: "body-photos/u1/f.jpg" }] });
    expect(filePaths(d, uid, false)).toEqual([]);
    expect(filePaths(d, uid, true)).toEqual(["body-photos/u1/f.jpg"]);
  });

  it("zipName tira o uid", () => {
    expect(zipName("meal-photos/u1/b.jpg")).toBe("arquivos/meal-photos/b.jpg");
  });

  it("manifest não tem push_subscriptions e lista os faltantes", () => {
    const d = data({ meals: [{ id: "m" }], push_subscriptions: [{ endpoint: "x" }] });
    const m = manifest(d, ["meal-photos/u1/a.jpg"], ["meal-photos/u1/z.jpg"], new Date("2026-10-20T12:00:00Z")) as Record<string, unknown>;
    expect(JSON.stringify(m)).not.toContain("push_subscriptions");
    expect(m.app).toBe("Yune");
    expect(m.formato).toBe(1);
    expect(m.exportado_em).toBe("2026-10-20T12:00:00.000Z");
    expect(m.arquivos).toEqual([{ caminho: "arquivos/meal-photos/a.jpg" }]);
    expect(m.arquivos_faltando).toEqual(["arquivos/meal-photos/z.jpg"]);
  });

  it("zipFileName usa o dia local (São Paulo perto da meia-noite UTC)", () => {
    expect(zipFileName(new Date("2026-10-20T01:30:00Z"), "America/Sao_Paulo")).toBe("yune-meus-dados-2026-10-19.zip");
  });

  it("filePaths mantém nomes com .. no meio e descarta segmento ..", () => {
    const d = data({ meals: [{ photo_path: "meal-photos/u1/a..jpg" }, { photo_path: "meal-photos/u1/.." }] });
    expect(filePaths(d, uid, false)).toEqual(["meal-photos/u1/a..jpg"]);
  });

  it("downloadAll não lê body_photos sem a opção e conta arquivos que falharam", async () => {
    vi.stubGlobal("URL", { createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const a = { click: () => {}, remove: () => {}, href: "", download: "" };
    vi.stubGlobal("document", { createElement: () => a, body: { appendChild: () => {} } });
    const r = await downloadAll({ includeBody: false, tz: "America/Sao_Paulo", onProgress: () => {} });
    expect(reads).not.toContain("body_photos");
    expect(r.missing).toBe(1);
    expect(a.download).toMatch(/^yune-meus-dados-/);
    vi.unstubAllGlobals();
  });
});
