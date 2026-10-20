import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { avgSleepHours, completion, createAutosaver, dayKey, SECTIONS } from "./anamnesis";
import type { Profile } from "./firebase";

const p = (sex: "f" | "m" | null): Profile => ({
  id: "u", name: null, sex, birth_year: null, height_cm: null, weight_kg: null,
  kcal_goal: 2000, water_goal_ml: 2000, sleep_goal_min: 480, timezone: "America/Sao_Paulo",
});

describe("completion", () => {
  it("é 0 sem respostas", () => expect(completion({}, p("m"))).toBe(0));
  it("uma de 9 seções visíveis (sexo m) = 11", () => {
    expect(completion({ objetivo: { principal: "Perder peso" } }, p("m"))).toBe(11);
  });
  it("ciclo só conta para sexo f (10 seções)", () => {
    const a = { ciclo: { regular: "Sim" } };
    expect(completion(a, p("m"))).toBe(0);
    expect(completion(a, p("f"))).toBe(10);
  });
  it("texto vazio, lista vazia e null não contam", () => {
    expect(completion({ objetivo: { principal: "  ", detalhe: null }, condicoes: { lista: [] } }, p("m"))).toBe(0);
  });
  it("número 0 conta como resposta", () => {
    expect(completion({ peso: { maior_peso: 0 } }, p("m"))).toBe(11);
  });
});

describe("dayKey", () => {
  it("usa o dia local do fuso", () => {
    expect(dayKey(new Date("2026-10-19T01:30:00Z"), "America/Sao_Paulo")).toBe("2026-10-18");
  });
});

describe("avgSleepHours", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("média das noites dos últimos 14 dias, ignora abertas e antigas", () => {
    const list = [
      { id: "a", bed_at: "2026-10-18T02:00:00Z", wake_at: "2026-10-18T10:00:00Z" },
      { id: "b", bed_at: "2026-10-17T03:00:00Z", wake_at: "2026-10-17T09:00:00Z" },
      { id: "c", bed_at: "2026-10-19T05:00:00Z", wake_at: null },
      { id: "d", bed_at: "2026-09-01T02:00:00Z", wake_at: "2026-09-01T10:00:00Z" },
    ];
    expect(avgSleepHours(list, now)).toBe(7);
  });
  it("sem registros = null", () => expect(avgSleepHours([], now)).toBeNull());
});

describe("SECTIONS", () => {
  it("ordem e chaves", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual(
      ["objetivo", "condicoes", "medicamentos", "suplementos", "alergias", "intestino", "rotina", "ciclo", "peso", "alimentacao"]);
  });
});

describe("createAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const mk = (fn = vi.fn(async () => {})) => ({ fn, a: createAutosaver(fn, 1000) });

  it("mudança salva uma vez depois de 1 s", async () => {
    const { fn, a } = mk();
    a.touch();
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("duas mudanças rápidas viram uma gravação (com o último valor)", async () => {
    let v = "";
    const fn = vi.fn(async () => { void v; });
    const a = createAutosaver(fn, 1000);
    v = "a"; a.touch();
    await vi.advanceTimersByTimeAsync(500);
    v = "b"; a.touch();
    await vi.advanceTimersByTimeAsync(1500);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("flush antes de 1 s salva uma vez e o timer não grava de novo", async () => {
    const { fn, a } = mk();
    a.touch();
    expect(await a.flush()).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("flush sem pendência não grava", async () => {
    const { fn, a } = mk();
    expect(await a.flush()).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });
  it("dispose salva a pendência uma vez e não grava depois", async () => {
    const { fn, a } = mk();
    a.touch();
    await a.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("dispose sem pendência não grava e não avisa status", async () => {
    const onStatus = vi.fn();
    const fn = vi.fn(async () => {});
    const a = createAutosaver(fn, 1000, onStatus);
    a.touch();
    onStatus.mockClear();
    await a.dispose();
    expect(onStatus).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("falha é informada, fica pendente e a nova tentativa grava", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined);
    const a = createAutosaver(fn, 1000);
    a.touch();
    expect(await a.flush()).toBe(false);
    expect(a.wrote).toBe(false);
    expect(await a.flush()).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(a.wrote).toBe(true);
  });
  it("virada de dia: cada gravação usa o dia da hora em que roda", () => {
    expect(dayKey(new Date("2026-10-19T02:59:00Z"), "America/Sao_Paulo")).toBe("2026-10-18");
    expect(dayKey(new Date("2026-10-19T03:00:00Z"), "America/Sao_Paulo")).toBe("2026-10-19");
  });
  it("resume depois de dispose volta a avisar o status (StrictMode)", async () => {
    const onStatus = vi.fn();
    const a = createAutosaver(vi.fn(async () => {}), 1000, onStatus);
    await a.dispose();
    a.resume();
    a.touch();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    expect(onStatus).toHaveBeenCalledWith("saving");
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });
});
