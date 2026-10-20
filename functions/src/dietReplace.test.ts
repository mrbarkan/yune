import { describe, expect, it, vi } from "vitest";
import { replaceDiets } from "./dietReplace.js";

function deps(old: { id: string; file_path: string | null }[]) {
  const list = vi.fn(async () => [...old, { id: "new", file_path: "diet-plans/u/a.pdf" }]);
  const create = vi.fn(async () => "new");
  const remove = vi.fn(async (_id: string) => {});
  const deactivate = vi.fn(async (_id: string) => {});
  const deleteFile = vi.fn(async (_p: string) => {});
  return { list, create, remove, deactivate, deleteFile };
}

describe("replaceDiets", () => {
  it("cria a nova e apaga as anteriores com arquivo", async () => {
    const d = deps([{ id: "a", file_path: "diet-plans/u/old.pdf" }, { id: "b", file_path: null }]);
    const id = await replaceDiets(d, { title: "x" });
    expect(id).toBe("new");
    expect(d.create).toHaveBeenCalledWith({ title: "x", active: true });
    expect(d.deleteFile).toHaveBeenCalledTimes(1);
    expect(d.deleteFile).toHaveBeenCalledWith("diet-plans/u/old.pdf");
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("falha ao apagar arquivo antigo não derruba a importação", async () => {
    const d = deps([{ id: "a", file_path: "p1" }, { id: "b", file_path: "p2" }]);
    d.deleteFile.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await replaceDiets(d, {});
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
    expect(await replaceDiets(d, {})).toBe("new");
    expect(d.remove.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    err.mockRestore();
  });

  it("falha ao listar não derruba a importação", async () => {
    const d = deps([]);
    d.list.mockRejectedValueOnce(new Error("boom"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await replaceDiets(d, {})).toBe("new");
    expect(d.remove).not.toHaveBeenCalled();
    err.mockRestore();
  });

  it("não apaga o arquivo da dieta nova", async () => {
    const d = deps([{ id: "a", file_path: "diet-plans/u/a.pdf" }]);
    await replaceDiets(d, { file_path: "diet-plans/u/a.pdf" });
    expect(d.deleteFile).not.toHaveBeenCalled();
    expect(d.remove).toHaveBeenCalledWith("a");
  });
});
