import { describe, expect, it } from "vitest";
import { isDeleting } from "./deleting.js";
import { memDb } from "./testing/memDb.js";

describe("isDeleting", () => {
  it("só é verdadeiro para quem tem a trava", async () => {
    const db = memDb({ "deleting/a": { at: "2026-10-20T12:00:00.000Z" } });
    expect(await isDeleting("a", db)).toBe(true);
    expect(await isDeleting("b", db)).toBe(false);
  });
});
