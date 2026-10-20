import { describe, expect, it } from "vitest";
import { parseProReturn, withoutProParam } from "./proReturn";

describe("parseProReturn", () => {
  it("ok", () => expect(parseProReturn("?pro=ok")).toBe("ok"));
  it("cancel", () => expect(parseProReturn("?a=1&pro=cancel")).toBe("cancel"));
  it("outro valor ou ausente", () => {
    expect(parseProReturn("?pro=x")).toBeNull();
    expect(parseProReturn("")).toBeNull();
  });
});

describe("withoutProParam", () => {
  it("remove só o pro", () => expect(withoutProParam("https://yune.app/?pro=ok&a=1#x")).toBe("/?a=1#x"));
  it("sem outros parâmetros", () => expect(withoutProParam("https://yune.app/?pro=cancel")).toBe("/"));
});
