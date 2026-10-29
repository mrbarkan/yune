import { describe, expect, it } from "vitest";
import { dayFromId, parseDeepLink, withoutDeepLink } from "./deepLink";

const DE = "2026-10-27T15:30:00.000Z";
const ATE = "2026-10-27T19:05:00.000Z";

describe("parseDeepLink", () => {
  it("lanche", () =>
    expect(parseDeepLink(`?registrar=lanche&de=${DE}&ate=${ATE}`)).toEqual({ kind: "snack", from: DE, to: ATE }));
  it("lanche com de/ate codificados", () =>
    expect(parseDeepLink("?registrar=lanche&de=2026-10-27T15%3A30%3A00.000Z&ate=2026-10-27T19%3A05%3A00.000Z"))
      .toEqual({ kind: "snack", from: DE, to: ATE }));
  it("fechar o dia", () => expect(parseDeepLink("?fechar=2026-10-27")).toEqual({ kind: "review", day: "2026-10-27" }));
  it("fechar com data em outro formato ou inexistente", () => {
    expect(parseDeepLink("?fechar=27-10-2026")).toBeNull();
    expect(parseDeepLink("?fechar=2026-02-30")).toBeNull();
    expect(parseDeepLink("?fechar=")).toBeNull();
  });
  it("de depois de ate, ou igual", () => {
    expect(parseDeepLink(`?registrar=lanche&de=${ATE}&ate=${DE}`)).toBeNull();
    expect(parseDeepLink(`?registrar=lanche&de=${DE}&ate=${DE}`)).toBeNull();
  });
  it("lanche sem de/ate ou com data inválida", () => {
    expect(parseDeepLink("?registrar=lanche")).toBeNull();
    expect(parseDeepLink(`?registrar=lanche&de=ontem&ate=${ATE}`)).toBeNull();
    expect(parseDeepLink(`?registrar=lanche&de=2026-10-27&ate=${ATE}`)).toBeNull();
    expect(parseDeepLink(`?registrar=lanche&de=2026-13-27T15:30:00.000Z&ate=${ATE}`)).toBeNull();
  });
  it("outra refeição ou nada", () => {
    expect(parseDeepLink(`?registrar=almoco&de=${DE}&ate=${ATE}`)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("?pro=ok")).toBeNull();
  });
});

describe("withoutDeepLink", () => {
  it("remove o fechar e mantém o resto", () => expect(withoutDeepLink("https://x/?fechar=2026-10-27&pro=ok")).toBe("/?pro=ok"));
  it("remove registrar, de e ate", () =>
    expect(withoutDeepLink(`https://x/?registrar=lanche&de=${DE}&ate=${ATE}#a`)).toBe("/#a"));
});

describe("dayFromId", () => {
  it("início do dia local", () => expect(dayFromId("2026-10-27")).toEqual(new Date(2026, 9, 27)));
});
