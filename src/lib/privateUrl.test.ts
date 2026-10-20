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
    expect(await a.url).toBe(await b.url);
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it("voltar dentro do prazo reaproveita", async () => {
    const { deps, cache } = setup();
    const h = cache.acquire("a");
    await h.url;
    h.release();
    vi.advanceTimersByTime(30_000);
    await cache.acquire("a").url;
    expect(deps.load).toHaveBeenCalledTimes(1);
    expect(deps.revoke).not.toHaveBeenCalled();
  });

  it("depois do prazo revoga e baixa de novo", async () => {
    const { deps, cache } = setup();
    const h = cache.acquire("a");
    await h.url;
    h.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.revoke).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
    await cache.acquire("a").url;
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it("falha não fica no cache", async () => {
    let fail = true;
    const { deps, cache } = setup(async () => {
      if (fail) throw new Error("x");
      return new Blob(["x"]);
    });
    await expect(cache.acquire("a").url).rejects.toThrow();
    fail = false;
    await cache.acquire("a").url;
    expect(deps.load).toHaveBeenCalledTimes(2);
  });

  it("com duas referências, soltar uma não revoga", async () => {
    const { deps, cache } = setup();
    await cache.acquire("a");
    const h = cache.acquire("a");
    await h.url;
    h.release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.revoke).not.toHaveBeenCalled();
  });

  it("soltar depois de uma falha não afeta quem readquiriu", async () => {
    let fail = true;
    const { deps, cache } = setup(async () => {
      if (fail) throw new Error("x");
      return new Blob(["x"]);
    });
    const stale = cache.acquire("a");
    await expect(stale.url).rejects.toThrow();
    fail = false;
    const fresh = cache.acquire("a");
    await fresh.url;
    stale.release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.revoke).not.toHaveBeenCalled();
    fresh.release();
  });

  it("sequência do StrictMode (adquirir, soltar, adquirir) não revoga", async () => {
    const { deps, cache } = setup();
    const h1 = cache.acquire("a");
    h1.release();
    const h2 = cache.acquire("a");
    await h2.url;
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.revoke).not.toHaveBeenCalled();
    expect(deps.load).toHaveBeenCalledTimes(1);
  });

  it("troca de caminho solta só o anterior", async () => {
    const { deps, cache } = setup();
    const a = cache.acquire("a");
    await a.url;
    a.release();
    const b = cache.acquire("b");
    await b.url;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(deps.revoke).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(1);
  });

  it("soltar duas vezes é inofensivo", async () => {
    const { deps, cache } = setup();
    const h1 = cache.acquire("a");
    const h2 = cache.acquire("a");
    await h1.url;
    h1.release();
    h1.release();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(deps.revoke).not.toHaveBeenCalled();
    h2.release();
  });
});
