import { describe, expect, it } from "vitest";
import { rescale, SCALES } from "./plate";

describe("tamanho do prato", () => {
  it("escalas", () => {
    expect(SCALES).toEqual([0.5, 0.75, 1, 1.5, 2]);
  });

  it("reescala cada item da escala atual para a nova", () => {
    expect(rescale([1, 2], 1, 0.5)).toEqual([0.5, 1]);
    expect(rescale([0.5], 0.5, 1)).toEqual([1]);
    expect(rescale([1], 1, 0.75)).toEqual([0.75]);
  });

  it("arredonda a 2 casas e nunca some com o item", () => {
    expect(rescale([0.1], 2, 0.5)).toEqual([0.05]);
    expect(rescale([1], 0.75, 1)).toEqual([1.33]);
  });
});
