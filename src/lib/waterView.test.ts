import { describe, expect, it } from "vitest";
import { waterView } from "./waterView";

describe("waterView", () => {
  it("não deixa adicionar antes de carregar", () => {
    const v = waterView({ base: null, failed: false }, 0);
    expect(v.canAdd).toBe(false);
    expect(v.total).toBeNull();
  });
  it("soma o carregado com o adicionado", () => {
    const v = waterView({ base: 500, failed: false }, 250);
    expect(v).toEqual({ canAdd: true, total: 750, onlyAdded: null });
  });
  it("com falha não mostra total, mas permite adicionar e mostra só o adicionado", () => {
    expect(waterView({ base: null, failed: true }, 0)).toEqual({ canAdd: true, total: null, onlyAdded: null });
    expect(waterView({ base: null, failed: true }, 300)).toEqual({ canAdd: true, total: null, onlyAdded: 300 });
  });
});
