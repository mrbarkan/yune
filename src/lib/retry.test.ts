import { describe, expect, it, vi } from "vitest";
import { retryDenied } from "./retry";

const denied = () => Object.assign(new Error("denied"), { code: "permission-denied" });
const noWait = async () => {};

describe("retryDenied", () => {
  it("renova o token e tenta de novo após permission-denied", async () => {
    const fn = vi.fn().mockRejectedValueOnce(denied()).mockResolvedValue("ok");
    const refresh = vi.fn().mockResolvedValue(undefined);
    await expect(retryDenied(fn, refresh, 3, noWait)).resolves.toBe("ok");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("desiste após o limite e repassa o erro", async () => {
    const fn = vi.fn().mockRejectedValue(denied());
    await expect(retryDenied(fn, async () => {}, 3, noWait)).rejects.toMatchObject({ code: "permission-denied" });
    expect(fn).toHaveBeenCalledTimes(3);
  });
  it("não repete outros erros", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("rede"));
    const refresh = vi.fn();
    await expect(retryDenied(fn, refresh, 3, noWait)).rejects.toThrow("rede");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
