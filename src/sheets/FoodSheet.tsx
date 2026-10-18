import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented, Sheet } from "@/components/Sheet";
import { SUPPLEMENTS, TACO, fromHistory, fromServing, norm, nutrition, searchFoods, type Food, type Portion } from "@/lib/foods";
import { compressImage } from "@/lib/image";
import { addDoc, getDocs, limit, orderBy, query as q } from "firebase/firestore";
import { ref, uploadBytes } from "firebase/storage";
import { estimateFood, rows, storage, table, type CustomFood, type FoodItem, type Meal, type Place, type Profile } from "@/lib/firebase";
import { fmtNum, fmtTime, fromLocalInput, toLocalInput } from "@/lib/time";

type PlateItem = { id: string; food: Food; portion: Portion; qty: number; ai?: boolean };
type Photo = { blob: Blob; base64: string; preview: string };
type Label = { name: string; brand: string; serving_label: string; serving_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number; notes: string };

const PLACES: { value: Place; label: string }[] = [
  { value: "casa", label: "Casa" },
  { value: "restaurante", label: "Restaurante" },
  { value: "delivery", label: "Delivery" },
];

export const mealName = (d: Date) => {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "Café da manhã";
  if (h < 15 && h >= 11) return "Almoço";
  if (h < 18 && h >= 15) return "Lanche";
  if (h < 23 && h >= 18) return "Jantar";
  return "Ceia";
};

const lastPlace = (): Place => {
  try {
    return (localStorage.getItem("yune:place") as Place) || "casa";
  } catch {
    return "casa";
  }
};

let seq = 0;
const newId = () => `p${++seq}`;

export function FoodSheet({ profile, onClose, onSaved }: { profile: Profile; onClose: () => void; onSaved: () => void }) {
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [place, setPlace] = useState<Place>(lastPlace);
  const [query, setQuery] = useState("");
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [label, setLabel] = useState<Label | null>(null);
  const [busy, setBusy] = useState<"" | "ai" | "label" | "save">("");
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState("");
  const [recentMeals, setRecentMeals] = useState<Meal[]>([]);
  const [custom, setCustom] = useState<Food[]>([]);
  const [history, setHistory] = useState<{ foods: Food[]; counts: Map<string, number> }>({ foods: [], counts: new Map() });
  const photoInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getDocs(q(table("meals"), orderBy("eaten_at", "desc"), limit(80))).then((snap) => {
      const meals = rows<Meal>(snap);
      const seen = new Set<string>();
      setRecentMeals(meals.filter((m) => m.items?.length && !seen.has(norm(m.description)) && seen.add(norm(m.description))).slice(0, 5));
      const items = meals.flatMap((m) => m.items ?? []);
      const counts = new Map<string, number>();
      for (const it of items) counts.set(norm(it.name), (counts.get(norm(it.name)) ?? 0) + 1);
      setHistory({ foods: fromHistory(items), counts });
    });
    getDocs(q(table("custom_foods"), orderBy("created_at", "desc"))).then((snap) =>
      setCustom(rows<CustomFood>(snap).map((c) => fromServing(`meu:${c.id}`, "meu", { ...c, brand: c.brand ?? "" }))),
    );
  }, []);

  const pool = useMemo(() => [...custom, ...history.foods, ...SUPPLEMENTS, ...TACO], [custom, history.foods]);
  const results = useMemo(() => searchFoods(query, pool), [query, pool]);
  const frequent = useMemo(
    () => [...history.foods].sort((a, b) => (history.counts.get(b.search) ?? 0) - (history.counts.get(a.search) ?? 0)).slice(0, 8),
    [history],
  );
  const quickKcal = /^\d{1,4}$/.test(query.trim()) ? Number(query.trim()) : null;

  const add = (food: Food, opts: Partial<PlateItem> = {}) => {
    setPlate((p) => [...p, { id: newId(), food, portion: food.portions[0], qty: 1, ...opts }]);
    setQuery("");
    navigator.vibrate?.(6);
  };

  const fromAiItem = (it: FoodItem): Food => {
    const [f] = fromHistory([{ ...it, grams: it.grams || 100 }]);
    return { ...f, key: `ai:${newId()}`, source: "recente" };
  };

  async function estimate(description: string, image?: Photo | null) {
    setBusy("ai");
    setErr("");
    const data = await estimateFood<{ items?: FoodItem[]; notes: string }>({
      mode: "meal", description, image: image ? { data: image.base64, media_type: "image/jpeg" } : undefined,
    });
    setBusy("");
    if (data.error) return setErr(data.error);
    const items = (data.items ?? []) as FoodItem[];
    setNotes(items.length ? "" : data.notes);
    setPlate((p) => [...p, ...items.map((it) => ({ id: newId(), food: fromAiItem(it), portion: { label: it.quantity, g: it.grams || 100 }, qty: 1, ai: true }))]);
    setQuery("");
  }

  async function onPhoto(file?: File) {
    if (!file) return;
    try {
      const img = await compressImage(file);
      setPhoto(img);
      await estimate(query.trim(), img);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function onLabel(file?: File) {
    if (!file) return;
    setBusy("label");
    setErr("");
    try {
      const img = await compressImage(file, 1600, 0.88);
      const data = await estimateFood<Label>({
        mode: "label", description: query.trim(), image: { data: img.base64, media_type: "image/jpeg" },
      });
      if (data.error) throw new Error(data.error);
      setLabel(data as Label);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveLabel() {
    if (!label) return;
    const fields: Omit<CustomFood, "id"> = {
      name: label.name, brand: label.brand || null, serving_label: label.serving_label, serving_g: label.serving_g,
      kcal: label.kcal, protein_g: label.protein_g, carbs_g: label.carbs_g, fat_g: label.fat_g,
    };
    let c: CustomFood;
    try {
      const doc = await addDoc(table("custom_foods"), { ...fields, created_at: new Date().toISOString() });
      c = { ...fields, id: doc.id };
    } catch {
      return setErr("Confira os valores do rótulo.");
    }
    const food = fromServing(`meu:${c.id}`, "meu", { ...c, brand: c.brand ?? "" });
    setCustom((list) => [food, ...list]);
    setLabel(null);
    add(food);
  }

  const lines = plate.map((p) => ({ ...p, n: nutrition(p.food, p.portion.g * p.qty) }));
  const total = lines.reduce((s, l) => s + l.n.kcal, 0);

  async function save() {
    setBusy("save");
    setErr("");
    let photo_path: string | null = null;
    if (photo) {
      photo_path = `meal-photos/${profile.id}/${crypto.randomUUID()}.jpg`;
      await uploadBytes(ref(storage, photo_path), photo.blob, { contentType: "image/jpeg" }).catch(() => (photo_path = null));
    }
    const items: FoodItem[] = lines.map((l) => ({
      name: l.food.name,
      quantity: l.qty === 1 ? l.portion.label : `${String(l.qty).replace(".", ",")} × ${l.portion.label}`,
      grams: Math.round(l.portion.g * l.qty),
      ...l.n,
    }));
    const sum = (k: "protein_g" | "carbs_g" | "fat_g") => Math.round(items.reduce((s, i) => s + i[k], 0) * 10) / 10;
    const error = await addDoc(table("meals"), {
      eaten_at: fromLocalInput(at),
      description: items.map((i) => i.name).join(", ").slice(0, 600) || mealName(new Date(at)),
      kcal: total,
      protein_g: sum("protein_g"),
      carbs_g: sum("carbs_g"),
      fat_g: sum("fat_g"),
      items,
      source: plate.some((p) => p.ai) ? "ai" : "manual",
      place,
      photo_path,
      created_at: new Date().toISOString(),
    }).then(() => null, () => "Não foi possível salvar.");
    setBusy("");
    if (error) return setErr(error);
    try {
      localStorage.setItem("yune:place", place);
    } catch {
      /* armazenamento indisponível */
    }
    onSaved();
  }

  const update = (id: string, patch: Partial<PlateItem>) => setPlate((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const when = new Date(at);

  return (
    <Sheet title={mealName(when)} accent="food" onClose={onClose}>
      <div className="food-meta">
        <label className="time-pill">
          <span>{fmtTime(when)}</span>
          <input type="datetime-local" value={at} onChange={(e) => e.target.value && setAt(e.target.value)} aria-label="Horário" />
        </label>
        <Segmented value={place} onChange={setPlace} options={PLACES} />
      </div>

      <div className="search">
        <input className="search-input" value={query} maxLength={600} placeholder="Buscar ou descrever…"
          onChange={(e) => setQuery(e.target.value)} enterKeyHint="search"
          onKeyDown={(e) => e.key === "Enter" && query.trim().length > 2 && !results.length && estimate(query.trim())} />
        <button className="cam" onClick={() => photoInput.current?.click()} aria-label="Foto do prato" disabled={!!busy}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.6" /></svg>
        </button>
        <input ref={photoInput} type="file" accept="image/*" hidden onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={labelInput} type="file" accept="image/*" hidden onChange={(e) => { onLabel(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {busy === "ai" && <p className="thinking"><span className="pulse">Olhando o prato</span></p>}
      {busy === "label" && <p className="thinking"><span className="pulse">Lendo o rótulo</span></p>}

      {query.trim() ? (
        <ul className="results">
          {quickKcal !== null && (
            <li><button onClick={() => add({ key: `kcal:${newId()}`, name: "Lançamento rápido", source: "recente", kcal: quickKcal, protein: 0, carbs: 0, fat: 0, portions: [{ label: "porção", g: 100 }], search: "" })}>
              <span><b>{fmtNum(quickKcal)} kcal</b><small>só as calorias</small></span><em>+</em>
            </button></li>
          )}
          {results.map((f) => (
            <li key={f.key}>
              <button onClick={() => add(f)}>
                <span><b>{f.name}</b><small>{f.brand ? `${f.brand} · ` : ""}{f.portions[0].label}{f.source === "meu" ? " · meu item" : ""}</small></span>
                <em>{fmtNum(nutrition(f, f.portions[0].g).kcal)}</em>
              </button>
            </li>
          ))}
          {query.trim().length > 2 && (
            <li className="ai-row">
              <button onClick={() => estimate(query.trim())} disabled={!!busy}>
                <span><b>Calcular “{query.trim().length > 40 ? query.trim().slice(0, 38) + "…" : query.trim()}”</b><small>estimativa automática, item por item</small></span><em>✦</em>
              </button>
            </li>
          )}
          <li className="ai-row">
            <button onClick={() => labelInput.current?.click()} disabled={!!busy}>
              <span><b>Fotografar o rótulo</b><small>suplementos e industrializados — fica salvo para a próxima</small></span><em>▦</em>
            </button>
          </li>
        </ul>
      ) : plate.length === 0 && !label ? (
        <div className="shortcuts">
          {recentMeals.length > 0 && (
            <div>
              <p className="eyebrow">Repetir</p>
              <div className="chips">
                {recentMeals.map((m) => (
                  <button key={m.id} className="chip" onClick={() => {
                    m.items!.forEach((it) => add(fromAiItem(it), { portion: { label: it.quantity, g: it.grams || 100 } }));
                    if (m.place) setPlace(m.place);
                  }}>
                    {m.description.length > 30 ? m.description.slice(0, 28) + "…" : m.description} <em>{fmtNum(m.kcal)}</em>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(frequent.length > 0 || custom.length > 0) && (
            <div>
              <p className="eyebrow">Frequentes</p>
              <div className="chips">
                {[...custom.slice(0, 4), ...frequent].map((f) => (
                  <button key={f.key} className="chip" onClick={() => add(f)}>{f.name}</button>
                ))}
              </div>
            </div>
          )}
          <div className="shortcut-actions">
            <button className="btn ghost" onClick={() => photoInput.current?.click()}>Foto do prato</button>
            <button className="btn ghost" onClick={() => labelInput.current?.click()}>Ler rótulo</button>
          </div>
        </div>
      ) : null}

      {label && (
        <div className="label-card">
          <p className="eyebrow">Novo item · confira</p>
          <div className="row">
            <label className="field"><span>Produto</span>
              <input value={label.name} onChange={(e) => setLabel({ ...label, name: e.target.value })} /></label>
            <label className="field"><span>Marca</span>
              <input value={label.brand} onChange={(e) => setLabel({ ...label, brand: e.target.value })} /></label>
          </div>
          <div className="row three">
            <label className="field"><span>Porção</span>
              <input value={label.serving_label} onChange={(e) => setLabel({ ...label, serving_label: e.target.value })} /></label>
            <label className="field"><span>Gramas</span>
              <input inputMode="decimal" value={label.serving_g} onChange={(e) => setLabel({ ...label, serving_g: Number(e.target.value.replace(",", ".")) || 0 })} /></label>
            <label className="field"><span>kcal</span>
              <input inputMode="decimal" value={label.kcal} onChange={(e) => setLabel({ ...label, kcal: Number(e.target.value.replace(",", ".")) || 0 })} /></label>
          </div>
          <p className="note">P {label.protein_g} g · C {label.carbs_g} g · G {label.fat_g} g{label.notes ? ` — ${label.notes}` : ""}</p>
          <div className="row">
            <button className="btn ghost" onClick={() => setLabel(null)}>Descartar</button>
            <button className="btn primary" disabled={!label.name || !label.serving_g} onClick={saveLabel}>Salvar e adicionar</button>
          </div>
        </div>
      )}

      {(plate.length > 0 || photo) && (
        <div className="plate">
          {photo && <img className="plate-photo" src={photo.preview} alt="Foto do prato" />}
          <ul>
            {lines.map((l) => (
              <li key={l.id}>
                <div className="plate-name">
                  <b>{l.food.name}</b>
                  <select value={l.food.portions.findIndex((p) => p.label === l.portion.label && p.g === l.portion.g)}
                    onChange={(e) => update(l.id, { portion: l.food.portions[Number(e.target.value)] })} aria-label="Porção">
                    {!l.food.portions.some((p) => p.label === l.portion.label && p.g === l.portion.g) && <option value={-1}>{l.portion.label}</option>}
                    {l.food.portions.map((p, i) => <option key={i} value={i}>{p.label}{/\d/.test(p.label) ? "" : ` (${p.g} g)`}</option>)}
                  </select>
                </div>
                <div className="stepper">
                  <button onClick={() => (l.qty <= 0.5 ? setPlate((p) => p.filter((x) => x.id !== l.id)) : update(l.id, { qty: l.qty - 0.5 }))}
                    aria-label="Menos">{l.qty <= 0.5 ? "×" : "−"}</button>
                  <span>{String(l.qty).replace(".", ",")}</span>
                  <button onClick={() => update(l.id, { qty: l.qty + 0.5 })} aria-label="Mais">+</button>
                </div>
                <span className="num">{fmtNum(l.n.kcal)}</span>
              </li>
            ))}
          </ul>
          {notes && <p className="note">{notes}</p>}
        </div>
      )}

      {err && <p className="note err">{err}</p>}

      {plate.length > 0 && (
        <div className="actions sticky">
          <button className="btn primary" disabled={!!busy} onClick={save}>
            {busy === "save" ? "Salvando…" : `Salvar · ${fmtNum(total)} kcal`}
          </button>
        </div>
      )}
    </Sheet>
  );
}
