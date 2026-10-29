import { beforeEach, describe, expect, it, vi } from "vitest";
import { processUser, runAll, slotPhrase, type Deps, type Payload, type Reminders, type Sub } from "./reminderStep.js";
import { localNow } from "./reminderTime.js";

// Relógio fixo em São Paulo (UTC-3): os testes rodam nos dois horários, com bedtime_time igual à hora local.
const CLOCKS = [
  { label: "00:30", now: new Date("2026-10-19T03:30:00Z"), hhmm: "00:30" },
  { label: "14:00", now: new Date("2026-10-19T17:00:00Z"), hhmm: "14:00" },
];
const mk = (hhmm: string): Reminders => ({
  water_enabled: false, water_every_min: 60, water_start: "00:00", water_end: "23:59",
  summary_enabled: true, summary_time: "00:00", bedtime_enabled: true, bedtime_time: hhmm, gap_enabled: false,
});
let r: Reminders = mk("00:30");
let NOW = CLOCKS[0]!.now;
const sub = (n: number): Sub => ({ endpoint: `e${n}`, p256dh: "p", auth: "a", created_at: `2026-01-0${n}T00:00:00Z`, remove: async () => {} });
const totals = { kcal_in: 1, kcal_out: 0, water_ml: 0, drinks_ml: 0, sleep_min: 0 };

function deps(over: Partial<Deps> = {}): Deps & { patches: Record<string, unknown>[]; pushed: string[] } {
  const patches: Record<string, unknown>[] = [];
  const pushed: string[] = [];
  return {
    patches, pushed,
    subs: async () => [sub(1)],
    profile: async () => ({ name: null, timezone: "America/Sao_Paulo", water_goal_ml: 2000, kcal_goal: 2000 }),
    totals: async () => totals,
    hasWaterSince: async () => false,
    lastMealAt: async () => null,
    sleepingNow: async () => false,
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
    const date = localNow("America/Sao_Paulo", now).date;
    expect(payloads).toEqual([{ title: "Seu resumo do dia está pronto", body: "Toque para ver no Yune.", tag: "summary", url: `/?fechar=${date}` }]);
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

  it("resumo detalhado mostra a água pura à parte quando há bebidas", async () => {
    const body = async (t: typeof totals) => {
      const payloads: { body: string }[] = [];
      const d = deps({ totals: async () => t, push: async (_s, p) => { payloads.push(p); } });
      await processUser("u", { ...r, push_details: true, bedtime_enabled: false }, d);
      return payloads[0]!.body;
    };
    expect(await body({ ...totals, water_ml: 1100, drinks_ml: 500 })).toContain("· 1,6 L (1,1 L de água) —");
    expect(await body({ ...totals, water_ml: 1100 })).toContain("· 1,1 L —");
    // Arredondam igual: só o total, como o rótulo do copo.
    expect(await body({ ...totals, water_ml: 1100, drinks_ml: 20 })).toContain("· 1,1 L —");
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

describe("lembrete de lanche (intervalo)", () => {
  // 16:40 em São Paulo; janela 09:00–21:00; última refeição 12:30 do mesmo dia.
  const now = new Date("2026-10-19T19:40:00Z");
  const LUNCH = "2026-10-19T15:30:00.000Z";
  const base: Reminders = {
    water_enabled: false, water_every_min: 120, water_start: "09:00", water_end: "21:00",
    summary_enabled: false, summary_time: "21:30", bedtime_enabled: false, bedtime_time: "23:00", gap_enabled: true,
  };
  function run(rem: Partial<Reminders> = {}, over: Partial<Deps> = {}) {
    const payloads: Payload[] = [];
    const d = deps({ now, lastMealAt: async () => LUNCH, push: async (_s, p) => { payloads.push(p); }, ...over });
    return processUser("u", { ...base, ...rem }, d).then(() => ({ payloads, patches: d.patches }));
  }

  it("pergunta 4 h depois do almoço, com link do intervalo e ações", async () => {
    const { payloads, patches } = await run();
    expect(payloads).toEqual([{
      title: "Beliscou algo desde o almoço?", body: "Um toque registra.", tag: "gap",
      url: `/?registrar=lanche&de=${encodeURIComponent(LUNCH)}&ate=${encodeURIComponent(now.toISOString())}`,
      actions: [{ action: "nada", title: "Nada" }, { action: "registrar", title: "Registrar" }],
    }]);
    expect(patches).toEqual([{ last_gap_at: now.toISOString(), gap_count_date: "2026-10-19", gap_count: 1 }]);
  });

  it("soma ao contador do dia", async () => {
    const { patches } = await run({ gap_count_date: "2026-10-19", gap_count: 1, last_gap_at: "2026-10-19T14:00:00.000Z" });
    expect(patches).toEqual([{ last_gap_at: now.toISOString(), gap_count_date: "2026-10-19", gap_count: 2 }]);
  });

  it("contador de outro dia recomeça", async () => {
    const { patches } = await run({ gap_count_date: "2026-10-18", gap_count: 2 });
    expect(patches[0]).toMatchObject({ gap_count: 1 });
  });

  it("não pergunta o mesmo intervalo duas vezes", async () => {
    expect((await run({ last_gap_at: LUNCH })).payloads).toEqual([]);
    expect((await run({ last_gap_at: "2026-10-19T18:00:00.000Z" })).payloads).toEqual([]);
  });

  it("no máximo duas vezes por dia", async () => {
    const { payloads, patches } = await run({ gap_count_date: "2026-10-19", gap_count: 2 });
    expect(payloads).toEqual([]);
    expect(patches).toEqual([]);
  });

  it("não pergunta dormindo, desligado, fora da janela ou com refeição há menos de 4 h", async () => {
    expect((await run({}, { sleepingNow: async () => true })).payloads).toEqual([]);
    expect((await run({ gap_enabled: false })).payloads).toEqual([]);
    expect((await run({ water_end: "16:00" })).payloads).toEqual([]);
    expect((await run({ water_start: "17:00" })).payloads).toEqual([]);
    expect((await run({}, { lastMealAt: async () => "2026-10-19T16:00:00.000Z" })).payloads).toEqual([]);
  });

  it("doc antigo sem gap_enabled conta como ligado", async () => {
    const { gap_enabled: _, ...old } = base;
    const payloads: Payload[] = [];
    await processUser("u", old as Reminders, deps({ now, lastMealAt: async () => LUNCH, push: async (_s, p) => { payloads.push(p); } }));
    expect(payloads.map((p) => p.tag)).toEqual(["gap"]);
  });

  it("sem refeição hoje: \"hoje\" e o intervalo começa na janela", async () => {
    const at = new Date("2026-10-19T16:05:00Z"); // 13:05 local
    const { payloads } = await run({}, { now: at, lastMealAt: async () => "2026-10-18T23:00:00.000Z" });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.title).toBe("Beliscou algo hoje?");
    expect(payloads[0]!.url).toBe(`/?registrar=lanche&de=${encodeURIComponent("2026-10-19T12:00:00.000Z")}&ate=${encodeURIComponent(at.toISOString())}`);
  });

  it("sem nenhuma refeição: \"hoje\"", async () => {
    const { payloads } = await run({}, { lastMealAt: async () => null });
    expect(payloads.map((p) => p.title)).toEqual(["Beliscou algo hoje?"]);
  });

  it("nunca mostra números, nem com push_details", async () => {
    const { payloads } = await run({ push_details: true });
    expect(payloads).toHaveLength(1);
    expect(payloads[0]!.title).not.toMatch(/\d/);
    expect(payloads[0]!.body).not.toMatch(/\d/);
  });

  it("resumo leva para Fechar o dia", async () => {
    const { payloads } = await run({ gap_enabled: false, summary_enabled: true, summary_time: "16:00" });
    expect(payloads.map((p) => p.url)).toEqual(["/?fechar=2026-10-19"]);
    const detailed = await run({ gap_enabled: false, summary_enabled: true, summary_time: "16:00", push_details: true });
    expect(detailed.payloads.map((p) => p.url)).toEqual(["/?fechar=2026-10-19"]);
  });
});

describe("slotPhrase", () => {
  it("segue os horários das refeições", () => {
    const at = (h: number, m = 0) => slotPhrase(h * 60 + m);
    expect(at(7)).toBe("desde o café da manhã");
    expect(at(10, 59)).toBe("desde o café da manhã");
    expect(at(11)).toBe("desde o almoço");
    expect(at(15)).toBe("desde o lanche");
    expect(at(18)).toBe("desde o jantar");
    expect(at(23)).toBe("desde a ceia");
    expect(at(4, 59)).toBe("desde a ceia");
    expect(at(5)).toBe("desde o café da manhã");
  });
});
