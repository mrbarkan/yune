import { describe, expect, it, vi } from "vitest";
import { activation, replaceDiets } from "./dietReplace.js";

const AT = "2026-10-20T12:00:00.000Z";
type Old = { id: string; file_path: string | null; created_at?: string | null };

function deps(old: Old[]) {
  const list = vi.fn(async () => [
    ...old.map((o) => ({ created_at: "2026-10-01T00:00:00.000Z", ...o })),
    { id: "new", file_path: "diet-plans/u/a.pdf", created_at: AT },
  ]);
  const newId = vi.fn(() => "new");
  const save = vi.fn(async (_id: string, _data: Record<string, unknown>) => {});
  const remove = vi.fn(async (_id: string) => {});
  const deactivate = vi.fn(async (_id: string) => {});
  const deleteFile = vi.fn(async (_p: string) => {});
  return { list, newId, save, remove, deactivate, deleteFile };
}

describe("replaceDiets", () => {
  it("cria a nova e apaga as anteriores com arquivo", async () => {
    const d = deps([{ id: "a", file_path: "diet-plans/u/old.pdf" }, { id: "b", file_path: null }]);
    const id = await replaceDiets(d, { title: "x", created_at: AT });
    expect(id).toBe("new");
    expect(d.save).toHaveBeenCalledWith("new", { title: "x", created_at: AT });
    expect(d.deleteFile).toHaveBeenCalledTimes(1);
    expect(d.deleteFile).toHaveBeenCalledWith("diet-plans/u/old.pdf");
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("falha ao apagar arquivo antigo não derruba a importação", async () => {
    const d = deps([{ id: "a", file_path: "p1" }, { id: "b", file_path: "p2" }]);
    d.deleteFile.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await replaceDiets(d, { created_at: AT });
    expect(id).toBe("new");
    expect(d.deleteFile).toHaveBeenCalledTimes(2);
    expect(d.deactivate).toHaveBeenCalledWith("a");
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["b"]);
    expect(err).toHaveBeenCalled();
    expect(err.mock.calls.every((c) => c[0] === "importDietPlan: limpeza" && !JSON.stringify(c).includes("boom"))).toBe(true);
    err.mockRestore();
  });

  it("falha ao apagar ou desativar um doc não interrompe os outros", async () => {
    const d = deps([{ id: "a", file_path: null }, { id: "b", file_path: null }]);
    d.remove.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await replaceDiets(d, { created_at: AT })).toBe("new");
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    err.mockRestore();
  });

  it("falha ao listar não derruba a importação", async () => {
    const d = deps([]);
    d.list.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await replaceDiets(d, { created_at: AT })).toBe("new");
    expect(d.remove).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("não apaga o arquivo da dieta nova", async () => {
    const d = deps([{ id: "a", file_path: "diet-plans/u/a.pdf" }]);
    await replaceDiets(d, { file_path: "diet-plans/u/a.pdf", created_at: AT });
    expect(d.deleteFile).not.toHaveBeenCalled();
    expect(d.remove).toHaveBeenCalledWith("a");
  });

  it("importação simultânea: não apaga uma dieta mais nova nem a do mesmo instante com id maior", async () => {
    const d = deps([
      { id: "old", file_path: "diet-plans/u/old.pdf" },
      { id: "zzz", file_path: "diet-plans/u/z.pdf", created_at: AT },
      { id: "newer", file_path: "diet-plans/u/n.pdf", created_at: "2026-10-20T12:00:01.000Z" },
      { id: "semData", file_path: null, created_at: null },
    ]);
    await replaceDiets(d, { created_at: AT });
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["old", "semData"]);
    expect(d.deleteFile).toHaveBeenCalledWith("diet-plans/u/old.pdf");
    expect(d.deleteFile).toHaveBeenCalledTimes(1);
  });

  it("sem created_at nos dados, grava a hora atual", async () => {
    const d = deps([]);
    await replaceDiets(d, { title: "x" });
    expect(typeof d.save.mock.calls[0][1].created_at).toBe("string");
  });
});

describe("activation", () => {
  const k = (id: string, created_at: string | null) => ({ id, created_at });
  it("sem ativas: a nova fica ativa", () => {
    expect(activation(k("n", AT), [])).toEqual({ deactivate: [], active: true });
  });
  it("desativa só as ativas mais antigas", () => {
    expect(activation(k("n", AT), [k("a", "2026-10-01T00:00:00.000Z"), k("b", null)])).toEqual({ deactivate: ["a", "b"], active: true });
  });
  it("commit fora de ordem: uma ativa mais nova já existe, a nova entra inativa e não a desativa", () => {
    expect(activation(k("a", AT), [k("b", "2026-10-20T12:00:01.000Z")])).toEqual({ deactivate: [], active: false });
  });
  it("nova tentativa da mesma transação ignora o próprio documento", () => {
    expect(activation(k("n", AT), [k("n", AT)])).toEqual({ deactivate: [], active: true });
  });
  it("mesmo instante: o id maior ganha", () => {
    expect(activation(k("b", AT), [k("a", AT)])).toEqual({ deactivate: ["a"], active: true });
    expect(activation(k("a", AT), [k("b", AT)])).toEqual({ deactivate: [], active: false });
  });
});
