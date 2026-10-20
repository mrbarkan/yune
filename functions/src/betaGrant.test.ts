import { describe, expect, it } from "vitest";
import { decideGrant, parseArgs, runGrant, type GrantStore } from "./betaGrant.js";

const now = new Date("2026-10-19T12:00:00.000Z");
const stripe = { status: "active", until: "2027-03-01T00:00:00.000Z", cancel_at_period_end: false, trial_end: null };

describe("parseArgs", () => {
  it("lê days, dry-run e project", () => {
    expect(parseArgs(["--days", "30", "--dry-run", "--project", "yune-x"], {})).toEqual({ days: 30, dryRun: true, project: "yune-x" });
  });
  it("exige days positivo", () => {
    expect(() => parseArgs([], {})).toThrow(/--days/);
    expect(() => parseArgs(["--days", "0"], {})).toThrow(/--days/);
    expect(() => parseArgs(["--days", "abc"], {})).toThrow(/--days/);
  });
  it("sem emulador exige --project", () => {
    expect(() => parseArgs(["--days", "30"], {})).toThrow(/--project/);
    expect(parseArgs(["--days", "30"], { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085" }).project).toBe("demo-yune");
  });
  it("rejeita argumento desconhecido", () => {
    expect(() => parseArgs(["--days", "30", "--x"], { FIRESTORE_EMULATOR_HOST: "h" })).toThrow(/--x/);
  });
});

describe("decideGrant", () => {
  it("sem entitlement grava beta_until = agora + dias", () => {
    const d = decideGrant(undefined, 30, now);
    expect(d.write).toBe(true);
    if (d.write) expect(d.data).toEqual({ beta_until: "2026-11-18T12:00:00.000Z", pro: true, until: "2026-11-18T12:00:00.000Z", source: "beta" });
  });
  it("pula quando o beta guardado é mais tarde", () => {
    expect(decideGrant({ beta_until: "2027-01-01T00:00:00.000Z" }, 30, now).write).toBe(false);
  });
  it("recalcula sem tocar no stripe (Stripe mais tarde vence)", () => {
    const d = decideGrant({ beta_until: null, stripe }, 30, now);
    expect(d.write).toBe(true);
    if (d.write) {
      expect(d.data).toEqual({ beta_until: "2026-11-18T12:00:00.000Z", pro: true, until: stripe.until, source: "stripe" });
      expect("stripe" in d.data).toBe(false);
    }
  });
  it("beta antigo e menor é substituído", () => {
    expect(decideGrant({ beta_until: "2026-10-20T00:00:00.000Z" }, 30, now).write).toBe(true);
  });
});

describe("runGrant", () => {
  const make = (data: Record<string, { beta_until?: string | null; stripe?: typeof stripe | null }>) => {
    const calls = { update: 0 };
    const store: GrantStore = {
      uids: async () => Object.keys(data),
      read: async (u) => data[u],
      update: async (u, decide) => {
        calls.update++;
        const d = decide(data[u]);
        if (d.write) data[u] = { ...data[u], ...d.data };
        return d.write;
      },
    };
    return { store, calls, data };
  };
  const seed = () => make({ a: {}, b: { beta_until: "2027-06-01T00:00:00.000Z" }, c: { stripe } });

  it("dry-run conta e não grava", async () => {
    const { store, calls, data } = seed();
    expect(await runGrant(store, { days: 30, dryRun: true }, now)).toEqual({ total: 3, granted: 2, skipped: 1 });
    expect(calls.update).toBe(0);
    expect(data.a).toEqual({});
  });
  it("grava e mantém o stripe", async () => {
    const { store, data } = seed();
    expect(await runGrant(store, { days: 30, dryRun: false }, now)).toEqual({ total: 3, granted: 2, skipped: 1 });
    expect(data.a?.beta_until).toBe("2026-11-18T12:00:00.000Z");
    expect(data.b?.beta_until).toBe("2027-06-01T00:00:00.000Z");
    expect(data.c?.stripe).toEqual(stripe);
  });
});
