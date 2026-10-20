import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUrlCache } from "./privateUrl";

function setup(load?: (p: string) => Promise<Blob>) {
  const deps = {
    load: vi.fn(load ?? (async () => new Blob(["x"]))),
    createUrl: vi.fn(() => "blob:fake"),
    revoke: vi.fn(),
  };
  return { deps, cache: createUrlCache(deps) };
}

describe("createUrlCache", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("duas montagens do mesmo caminho baixam uma vez", async () => {
    const { deps, cache } = setup();
    const a = cache.acquire("a");
    const b = cache.acquire("a");
    expect(await a).toBe(await b);
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it("voltar dentro do prazo reaproveita", async () => {
    const { deps, cache } = setup();
    await cache.acquire("a");
    cache.release("a");
    vi.advanceTimersByTime(30_000);
    await cache.acquire("a");
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(deps.revoke).not.toHaveBeenCalled();
  });

  it("depois do prazo revoga e baixa de novo", async () => {
    const { deps, cache } = setup();
    await cache.acquire("a");
    cache.release("a");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.revoke).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
    await cache.acquire("a");
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it("falha não fica no cache", async () => {
    let fail = true;
    const { deps, cache } = setup(async () => {
      if (fail) throw new Error("x");
      return new Blob(["x"]);
    });
    await expect(cache.acquire("a")).rejects.toThrow();
    fail = false;
    await cache.acquire("a");
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it("com duas referências, soltar uma não revoga", async () => {
    const { deps, cache } = setup();
    await cache.acquire("a");
    await cache.acquire("a");
    cache.release("a");
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.revoke).not.toHaveBeenCalled();
  });
});
