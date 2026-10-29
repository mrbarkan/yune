import { describe, expect, it } from "vitest";
import type { Meal } from "./firebase";
import { findGaps, midpoint, missingSlots, slotChips, snackChips } from "./gaps";
import { mealName } from "./slots";

// npm test roda com TZ=America/Sao_Paulo: horários abaixo são locais.
const DAY = new Date(2026, 9, 27);
const at = (h: number, m = 0, day = 27) => new Date(2026, 9, day, h, m).toISOString();
const WIN = { start: "09:00", end: "21:00" };

let n = 0;
const meal = (description: string, eaten_at: string, items = true): Meal => ({
  id: `m${++n}`, eaten_at, description, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1,
  items: items ? [{ name: description, quantity: "1 porção", grams: 100, kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1 }] : null,
  source: "manual", place: "casa", photo_path: null,
});

describe("mealName", () => {
  it("faixas: café 5–11, almoço 11–15, lanche 15–18, jantar 18–23, ceia no resto", () => {
    const name = (h: number) => mealName(new Date(2026, 9, 27, h, 30));
    expect([4, 5, 10, 11, 14, 15, 17, 18, 22, 23].map(name)).toEqual([
      "Ceia", "Café da manhã", "Café da manhã", "Almoço", "Almoço", "Lanche", "Lanche", "Jantar", "Jantar", "Ceia",
    ]);
  });
});

describe("findGaps", () => {
  it("intervalo de 4 h ou mais entre refeições; o fim (20:10→21:00) fica de fora", () => {
    const g = findGaps([at(20, 10), at(8, 40), at(12, 30)], DAY, new Date(2026, 9, 27, 21, 30), WIN);
    expect(g).toEqual([{ key: at(12, 30), from: at(12, 30), to: at(20, 10) }]);
  });

  it("sem intervalo: o fim tem só 3 h", () => {
    expect(findGaps([at(8, 40), at(10)], DAY, new Date(2026, 9, 27, 13), WIN)).toEqual([]);
  });

  it("hoje: o fim vai da última refeição até o fim da janela", () => {
    const g = findGaps([at(10), at(13)], DAY, new Date(2026, 9, 27, 21, 30), WIN);
    expect(g).toEqual([{ key: at(13), from: at(13), to: at(21) }]);
  });

  it("hoje, antes do fim da janela: o fim vai até agora e mantém a chave", () => {
    const g = findGaps([at(13)], DAY, new Date(2026, 9, 27, 17, 30), WIN);
    expect(g).toEqual([{ key: at(13), from: at(13), to: at(17, 30) }]);
  });

  it("dia passado: o fim vai até o fim da janela", () => {
    const g = findGaps([at(8)], DAY, new Date(2026, 9, 28, 0, 30), WIN);
    expect(g).toEqual([{ key: at(8), from: at(8), to: at(21) }]);
  });

  it("sem refeições não há intervalo (o café que falta é de missingSlots)", () => {
    expect(findGaps([], DAY, new Date(2026, 9, 27, 21, 30), WIN)).toEqual([]);
  });

  it("ignora refeições de outros dias", () => {
    expect(findGaps([at(8, 0, 26), at(20)], DAY, new Date(2026, 9, 27, 21, 30), WIN)).toEqual([]);
  });
});

describe("missingSlots", () => {
  const slots = (meals: string[], now: Date, day = DAY) => missingSlots(meals, day, now).map((s) => s.slot);

  it("às 21:30 de hoje, só com almoço: faltam café e jantar", () => {
    expect(slots([at(12, 30)], new Date(2026, 9, 27, 21, 30))).toEqual(["Café da manhã", "Jantar"]);
  });

  it("às 20:00 o jantar ainda não é perguntado", () => {
    expect(slots([at(12, 30)], new Date(2026, 9, 27, 20))).toEqual(["Café da manhã"]);
  });

  it("às 10:00 sem refeições: o café ainda está aberto", () => {
    expect(slots([], new Date(2026, 9, 27, 10))).toEqual([]);
  });

  it("dia passado sem refeições: as três", () => {
    const s = missingSlots([], DAY, new Date(2026, 9, 28, 0, 30));
    expect(s).toEqual([
      { key: "slot:Café da manhã", slot: "Café da manhã", at: at(8) },
      { key: "slot:Almoço", slot: "Almoço", at: at(13) },
      { key: "slot:Jantar", slot: "Jantar", at: at(20) },
    ]);
  });
});

describe("chips", () => {
  const history = [
    meal("Iogurte, granola", at(16, 0, 20)),
    meal("Arroz, feijão", at(12, 30, 21)),
    meal("Iogurte, granola", at(16, 0, 22)),
    meal("Banana", at(16, 30, 23)),
    meal("Arroz, feijão", at(12, 30, 24)),
    meal("Iogurte, granola", at(16, 0, 25)),
    meal("Bolo", at(16, 0, 26), false),
  ];

  it("snackChips: lanches com itens, mais frequentes primeiro", () => {
    expect(snackChips(history).map((m) => m.description)).toEqual(["Iogurte, granola", "Banana"]);
  });

  it("snackChips devolve a refeição mais recente de cada grupo", () => {
    expect(snackChips(history)[0].eaten_at).toBe(at(16, 0, 25));
  });

  it("snackChips: empate fica com a mais recente; 23:30 conta como ceia", () => {
    const chips = snackChips([...history, meal("Chá", at(23, 30, 26))]);
    expect(chips.map((m) => m.description)).toEqual(["Iogurte, granola", "Chá", "Banana"]);
  });

  it("snackChips agrupa sem acento e maiúsculas", () => {
    expect(snackChips([meal("Maçã", at(16, 0, 20)), meal("maca", at(16, 0, 21)), meal("Banana", at(16, 0, 22))]).map((m) => m.description))
      .toEqual(["maca", "Banana"]);
  });

  it("snackChips respeita o limite", () => {
    expect(snackChips(history, 1)).toHaveLength(1);
  });

  it("slotChips filtra pela refeição", () => {
    expect(slotChips(history, "Almoço").map((m) => m.description)).toEqual(["Arroz, feijão"]);
  });
});

describe("midpoint", () => {
  it("meio do intervalo, em ISO", () => {
    expect(midpoint("2026-10-27T15:30:00.000Z", "2026-10-27T23:10:00.000Z")).toBe("2026-10-27T19:20:00.000Z");
  });
});
