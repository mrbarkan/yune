import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Measurement, Profile } from "./firebase";

// Firestore de mentira: cada chamada vira um objeto que dá para conferir.
const fs = vi.hoisted(() => ({
  calls: [] as unknown[][],
  newest: [] as { weight_kg: number }[],
  failRead: false,
}));
vi.mock("./firebase", () => ({
  table: (name: string) => ({ table: name }),
  row: (name: string, id: string) => ({ row: name, id }),
  profileDoc: (id: string) => ({ profile: id }),
  rows: (snap: { docs: unknown[] }) => snap.docs,
}));
vi.mock("firebase/firestore", () => ({
  query: (...parts: unknown[]) => ({ query: parts }),
  orderBy: (field: string, dir = "asc") => ({ orderBy: field, dir }),
  limit: (n: number) => ({ limit: n }),
  getDocs: async (q: unknown) => {
    fs.calls.push(["getDocs", q]);
    if (fs.failRead) throw new Error("offline");
    return { docs: fs.newest };
  },
  updateDoc: async (ref: unknown, data: unknown) => void fs.calls.push(["updateDoc", ref, data]),
  addDoc: async (ref: unknown, data: unknown) => (fs.calls.push(["addDoc", ref, data]), { id: "novo" }),
  deleteDoc: async (ref: unknown) => void fs.calls.push(["deleteDoc", ref]),
}));

const { changeSince, deleteMeasurement, saveMeasurement, syncProfileWeight } = await import("./measurements");

const m = (id: string, measured_at: string, weight_kg: number): Measurement => ({
  id, measured_at, weight_kg, waist_cm: null, hip_cm: null, neck_cm: null, source: "manual",
});
const a = m("a", "2026-09-01T10:00:00.000Z", 75);
const b = m("b", "2026-10-01T10:00:00.000Z", 72);

describe("syncProfileWeight", () => {
  beforeEach(() => {
    fs.calls = [];
    fs.newest = [];
    fs.failRead = false;
  });
  const newestQuery = ["getDocs", { query: [{ table: "measurements" }, { orderBy: "measured_at", dir: "desc" }, { limit: 1 }] }];

  it("grava no perfil o peso da medida mais recente", async () => {
    fs.newest = [{ weight_kg: 72 }];
    await syncProfileWeight("u1");
    expect(fs.calls).toEqual([newestQuery, ["updateDoc", { profile: "u1" }, { weight_kg: 72 }]]);
  });
  it("sem medidas, não mexe no perfil", async () => {
    await syncProfileWeight("u1");
    expect(fs.calls).toEqual([newestQuery]);
  });
});

describe("saveMeasurement / deleteMeasurement", () => {
  const profile = { id: "u1" } as Profile;
  beforeEach(() => {
    fs.calls = [];
    fs.newest = [{ weight_kg: 75 }];
    fs.failRead = false;
  });

  it("edição com data antiga: o perfil fica com o peso da mais recente, não o da editada", async () => {
    const warn = await saveMeasurement({ ...a, weight_kg: 70 }, profile, "a");
    expect(warn).toBeUndefined();
    expect(fs.calls[0]).toEqual(["updateDoc", { row: "measurements", id: "a" }, expect.objectContaining({ weight_kg: 70 })]);
    expect(fs.calls.at(-1)).toEqual(["updateDoc", { profile: "u1" }, { weight_kg: 75 }]);
  });
  it("medida nova: grava e depois sincroniza o peso do perfil", async () => {
    await saveMeasurement({ ...b, created_at: undefined }, profile);
    expect(fs.calls.map((c) => c[0])).toEqual(["addDoc", "getDocs", "updateDoc"]);
  });
  it("apagar a mais recente devolve o perfil ao peso da anterior", async () => {
    const warn = await deleteMeasurement("b", "u1");
    expect(warn).toBeUndefined();
    expect(fs.calls[0]).toEqual(["deleteDoc", { row: "measurements", id: "b" }]);
    expect(fs.calls.at(-1)).toEqual(["updateDoc", { profile: "u1" }, { weight_kg: 75 }]);
  });
  it("falha ao sincronizar vira aviso (a medida já foi gravada; tentar de novo duplicaria)", async () => {
    fs.failRead = true;
    expect(await saveMeasurement({ ...b, created_at: undefined }, profile)).toMatch(/peso do perfil/);
    expect(await deleteMeasurement("b", "u1")).toMatch(/peso do perfil/);
  });
});

describe("changeSince", () => {
  const day = 86_400_000;
  const at = (n: number) => new Date(Date.parse("2026-10-19T10:00:00.000Z") - n * day).toISOString();
  it("compara com a medida mais perto de 56 dias antes", () => {
    const list = [m("1", at(60), 78), m("2", at(50), 77), m("3", at(0), 72)];
    expect(changeSince(list)).toEqual({ delta: -6, days: 60 });
  });
  it("some quando nada cai na janela de 42 a 70 dias", () => {
    expect(changeSince([m("1", at(20), 75), m("2", at(0), 72)])).toBeNull();
  });
  it("some com uma só medida", () => {
    expect(changeSince([m("1", at(0), 72)])).toBeNull();
  });
});
