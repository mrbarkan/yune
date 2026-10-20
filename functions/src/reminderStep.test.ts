import { beforeEach, describe, expect, it, vi } from "vitest";
import { processUser, runAll, type Deps, type Reminders, type Sub } from "./reminderStep.js";

// Relógio fixo em São Paulo (UTC-3): os testes rodam nos dois horários, com bedtime_time igual à hora local.
const CLOCKS = [
  { label: "00:30", now: new Date("2026-10-19T03:30:00Z"), hhmm: "00:30" },
  { label: "14:00", now: new Date("2026-10-19T17:00:00Z"), hhmm: "14:00" },
];
const mk = (hhmm: string): Reminders => ({
  water_enabled: false, water_every_min: 60, water_start: "00:00", water_end: "23:59",
  summary_enabled: true, summary_time: "00:00", bedtime_enabled: true, bedtime_time: hhmm,
});
let r: Reminders = mk("00:30");
let NOW = CLOCKS[0]!.now;
const sub = (n: number): Sub => ({ endpoint: `e${n}`, p256dh: "p", auth: "a", created_at: `2026-01-0${n}T00:00:00Z`, remove: async () => {} });
const totals = { kcal_in: 1, kcal_out: 0, water_ml: 0, sleep_min: 0 };

function deps(over: Partial<Deps> = {}): Deps & { patches: Record<string, unknown>[]; pushed: string[] } {
  const patches: Record<string, unknown>[] = [];
  const pushed: string[] = [];
  return {
    patches, pushed,
    subs: async () => [sub(1)],
    profile: async () => ({ name: null, timezone: "America/Sao_Paulo", water_goal_ml: 2000, kcal_goal: 2000 }),
    totals: async () => totals,
    hasWaterSince: async () => false,
    patch: async (_u, p) => { patches.push(p); },
    push: async (s) => { pushed.push(s.endpoint); },
    now: NOW,
    ...over,
  };
}

describe.each(CLOCKS)("processUser com relógio $label", ({ now, hhmm }) => {
  beforeEach(() => { NOW = now; r = mk(hhmm); });

  it("resumo sem números por padrão", async () => {
    const payloads: unknown[] = [];
    const totalsSpy = vi.fn(async () => totals);
    const d = deps({ totals: totalsSpy, push: async (_s, p) => { payloads.push(p); } });
    await processUser("u", { ...r, bedtime_enabled: false }, d);
    expect(payloads).toEqual([{ title: "Seu resumo do dia está pronto", body: "Toque para ver no Yune.", tag: "summary" }]);
    expect(totalsSpy).not.toHaveBeenCalled();
  });

  it("água sem números por padrão", async () => {
    const payloads: unknown[] = [];
    const d = deps({ push: async (_s, p) => { payloads.push(p); } });
    await processUser("u", { ...r, summary_enabled: false, bedtime_enabled: false, water_enabled: true }, d);
    expect(payloads).toEqual([{ title: "Um copo d'água?", body: "Hora de se hidratar.", tag: "water" }]);
  });

  it("push_details true mantém os números", async () => {
    const payloads: { title: string; body: string; tag: string }[] = [];
    const d = deps({ push: async (_s, p) => { payloads.push(p); } });
    await processUser("u", { ...r, push_details: true, bedtime_enabled: false, water_enabled: true }, d);
    expect(payloads.find((p) => p.tag === "summary")?.title).toBe("Seu dia: 1 kcal líquidas");
    expect(payloads.find((p) => p.tag === "water")?.body).toBe("Meta de hoje: 2 L.");
  });

  it("usa só as 5 assinaturas mais novas", async () => {
    const many = [1, 2, 3, 4, 5, 6, 7].map(sub);
    const d = deps({ subs: async () => many });
    await processUser("u", { ...r, bedtime_enabled: false }, d);
    expect(d.pushed).toEqual(["e7", "e6", "e5", "e4", "e3"]);
  });

  it("falha depois de um envio bem-sucedido ainda grava last_*", async () => {
    const d = deps({ totals: async () => totals, hasWaterSince: async () => { throw new Error("boom"); } });
    await expect(processUser("u", { ...r, water_enabled: true }, d)).rejects.toThrow("boom");
    expect(d.patches.map((p) => Object.keys(p)[0])).toEqual(["last_summary_date", "last_bedtime_date"]);
  });

  it("falha ao apagar assinatura morta não impede o patch", async () => {
    const dead = { ...sub(1), remove: async () => { throw new Error("x"); } };
    const d = deps({ subs: async () => [dead], push: async () => { throw Object.assign(new Error("gone"), { statusCode: 410 }); } });
    await processUser("u", r, d);
    expect(d.patches).toHaveLength(2);
  });

  it("registra nome e status de erros de envio que não são 404/410", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ push: async () => { throw Object.assign(new Error("m"), { statusCode: 500 }); } });
    await processUser("u", { ...r, bedtime_enabled: false }, d);
    expect(spy).toHaveBeenCalledWith("send-reminders: envio falhou", "u", "Error", 500);
    spy.mockRestore();
  });

  it("fuso inválido cai no padrão sem lançar", async () => {
    const d = deps({ profile: async () => ({ name: null, timezone: "x", water_goal_ml: 2000, kcal_goal: 2000 }) });
    await expect(processUser("u", r, d)).resolves.toBe(2);
  });

  it("sem assinaturas ou sem perfil não envia", async () => {
    expect(await processUser("u", r, deps({ subs: async () => [] }))).toBe(0);
    expect(await processUser("u", r, deps({ profile: async () => undefined }))).toBe(0);
  });
});

describe("runAll", () => {
  it("um usuário que lança não impede o seguinte", async () => {
    NOW = CLOCKS[0]!.now; r = mk("00:30");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAll(
      [{ id: "a", data: r }, { id: "b", data: r }],
      (uid) => deps({ subs: async () => { if (uid === "a") throw new Error("x"); return [sub(1)]; } }),
    );
    expect(res).toEqual({ sent: 2, failed: 1 });
    spy.mockRestore();
  });
  it("makeDeps que lança também é isolado", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await runAll([{ id: "a", data: r }], () => { throw new Error("x"); });
    expect(res).toEqual({ sent: 0, failed: 1 });
    spy.mockRestore();
  });
});
