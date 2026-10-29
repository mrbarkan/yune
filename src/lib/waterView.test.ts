import { describe, expect, it } from "vitest";
import { DEFAULT_WATER_SIZES } from "./defaults";
import { containersOf, validContainers, waterView } from "./waterView";

describe("waterView", () => {
  it("não deixa adicionar antes de carregar", () => {
    const v = waterView({ base: null, failed: false }, 0);
    expect(v.canAdd).toBe(false);
    expect(v.total).toBeNull();
  });
  it("soma o carregado com o adicionado", () => {
    const v = waterView({ base: { water: 500, drinks: 0 }, failed: false }, 250);
    expect(v).toEqual({ canAdd: true, total: 750, water: 750, drinks: 0, onlyAdded: null });
  });
  it("bebidas das refeições entram no total, à parte da água", () => {
    const v = waterView({ base: { water: 1100, drinks: 500 }, failed: false }, 250);
    expect(v).toMatchObject({ total: 1850, water: 1350, drinks: 500 });
  });
  it("com falha não mostra total, mas permite adicionar e mostra só o adicionado", () => {
    expect(waterView({ base: null, failed: true }, 0)).toEqual({ canAdd: true, total: null, water: null, drinks: null, onlyAdded: null });
    expect(waterView({ base: null, failed: true }, 300)).toEqual({ canAdd: true, total: null, water: null, drinks: null, onlyAdded: 300 });
  });
});

describe("containersOf", () => {
  it("sem nada: quatro copos padrão", () => {
    expect(containersOf({})).toEqual(DEFAULT_WATER_SIZES.map((ml) => ({ name: "Copo", ml })));
  });
  it("tamanhos antigos viram copos", () => {
    expect(containersOf({ water_sizes: [100, 200, 300, 400] })).toEqual([100, 200, 300, 400].map((ml) => ({ name: "Copo", ml })));
  });
  it("recipientes com nome têm prioridade", () => {
    const list = [{ name: "Garrafa", ml: 750 }];
    expect(containersOf({ water_containers: list, water_sizes: [100, 200, 300, 400] })).toEqual(list);
  });
  it("lista vazia ou grande demais cai para os copos", () => {
    expect(containersOf({ water_containers: [] })).toHaveLength(4);
    expect(containersOf({ water_containers: Array(7).fill({ name: "Copo", ml: 200 }) })).toHaveLength(4);
  });
});

describe("validContainers", () => {
  const ok = { name: "Garrafa", ml: 750 };
  it("de 1 a 6", () => {
    expect(validContainers([])).toBe("De 1 a 6 recipientes.");
    expect(validContainers(Array(7).fill(ok))).toBe("De 1 a 6 recipientes.");
  });
  it("nome obrigatório e até 40 letras", () => {
    expect(validContainers([{ name: "", ml: 200 }])).toBe("Dê um nome a cada recipiente.");
    expect(validContainers([{ name: "   ", ml: 200 }])).toBe("Dê um nome a cada recipiente.");
    expect(validContainers([{ name: "x".repeat(41), ml: 200 }])).toBe("Dê um nome a cada recipiente.");
  });
  it("ml inteiro de 10 a 3000", () => {
    for (const ml of [5, 3001, 250.5, NaN]) expect(validContainers([{ name: "Copo", ml }]), String(ml)).toBe("Use valores entre 10 e 3000 ml.");
  });
  it("lista válida", () => {
    expect(validContainers([ok, { name: "Copo", ml: 10 }, { name: "x".repeat(40), ml: 3000 }])).toBeNull();
  });
});
