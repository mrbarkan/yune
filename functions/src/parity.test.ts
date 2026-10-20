import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

// Do `export function nome` até o primeiro "\n}\n" (o comentário de documentação fica acima e não entra).
function fnSource(text: string, name: string) {
  const start = text.indexOf(`export function ${name}`);
  if (start < 0) throw new Error(`função ${name} não encontrada`);
  const end = text.indexOf("\n}\n", start);
  if (end < 0) throw new Error(`fim de ${name} não encontrado`);
  return text.slice(start, end + 2).split("\n").map((l) => l.trim()).join("\n");
}

describe("paridade app x funções", () => {
  it("PRO_OPEN igual no app e nas funções", () => {
    const re = /PRO_OPEN = (true|false);/;
    const app = re.exec(read("../../src/lib/pro.ts"));
    const fn = re.exec(read("./pro.ts"));
    expect(app).not.toBeNull();
    expect(fn).not.toBeNull();
    expect(app![1]).toBe(fn![1]);
  });

  it("parseDecimal do servidor é cópia exata do app", () => {
    expect(fnSource(read("./healthDoc.ts"), "parseDecimal")).toBe(fnSource(read("../../src/lib/num.ts"), "parseDecimal"));
  });
});
