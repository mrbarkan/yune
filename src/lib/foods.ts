import taco from "@/data/taco.json";
import supplements from "@/data/supplements.json";
import type { FoodItem } from "./supabase";

export type Portion = { label: string; g: number };

/** Alimento normalizado: valores por 100 g + medidas caseiras. */
export type Food = {
  key: string;
  name: string;
  brand?: string;
  source: "taco" | "suplemento" | "meu" | "recente";
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  portions: Portion[];
  search: string;
};

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9% ]+/g, " ").replace(/\s+/g, " ").trim();

// Nomes do dia a dia para os itens mais comuns da TACO (o nome original continua buscável).
const RENAME: Record<string, string> = {
  "Arroz, tipo 1, cozido": "Arroz branco, cozido",
  "Arroz, tipo 2, cozido": "Arroz branco (tipo 2), cozido",
  "Pão, trigo, francês": "Pão francês",
  "Pão, trigo, forma, integral": "Pão de forma integral",
  "Pão, trigo, sovado": "Pão sovado",
  "Café, infusão 10%": "Café coado (sem açúcar)",
  "Ovo, de galinha, inteiro, frito": "Ovo frito",
  "Ovo, de galinha, inteiro, cozido/10minutos": "Ovo cozido",
  "Ovo, de galinha, clara, cozida/10minutos": "Clara de ovo cozida",
  "Leite, de vaca, integral": "Leite integral",
  "Leite, de vaca, desnatado, UHT": "Leite desnatado",
  "Leite, de vaca, achocolatado": "Leite achocolatado",
  "Frango, peito, sem pele, grelhado": "Peito de frango grelhado",
  "Frango, peito, sem pele, cozido": "Peito de frango cozido",
  "Carne, bovina, patinho, sem gordura, grelhado": "Patinho grelhado",
  "Batata, inglesa, cozida": "Batata cozida",
  "Batata, inglesa, frita": "Batata frita",
  "Queijo, minas, frescal": "Queijo minas frescal",
  "Iogurte, natural": "Iogurte natural",
};

/** "Feijão, carioca, cozido" → "Feijão carioca, cozido" */
const pretty = (n: string) => RENAME[n] ?? n.replace(/^([^,]+), ([^,]+)/, "$1 $2");

// Medidas caseiras por padrão de nome (primeira regra que casar vence).
const RULES: [RegExp, Portion[]][] = [
  [/^arroz/, [{ label: "colher de servir", g: 45 }, { label: "escumadeira", g: 90 }]],
  [/^(feijao|lentilha|grao de bico|ervilha)/, [{ label: "concha média", g: 140 }, { label: "meia concha", g: 70 }]],
  [/^pao trigo frances/, [{ label: "unidade", g: 50 }]],
  [/^pao de queijo/, [{ label: "unidade média", g: 30 }]],
  [/^pao/, [{ label: "fatia", g: 25 }]],
  [/^ovo de codorna/, [{ label: "unidade", g: 10 }]],
  [/^ovo/, [{ label: "unidade", g: 50 }]],
  [/^(macarrao|espaguete|lasanha|nhoque)/, [{ label: "pegador", g: 110 }, { label: "prato raso", g: 220 }]],
  [/^(cuscuz|tapioca|beiju)/, [{ label: "porção", g: 120 }]],
  [/^(cafe infusao|cha )/, [{ label: "xícara (50 ml)", g: 50 }, { label: "caneca (200 ml)", g: 200 }]],
  [/^cerveja/, [{ label: "lata (350 ml)", g: 350 }, { label: "copo (200 ml)", g: 200 }]],
  [/^vinho/, [{ label: "taça (150 ml)", g: 150 }]],
  [/(suco|refrigerante|bebida|agua de coco|caldo de cana)/, [{ label: "copo (200 ml)", g: 200 }, { label: "lata (350 ml)", g: 350 }]],
  [/^iogurte/, [{ label: "pote", g: 170 }]],
  [/^leite/, [{ label: "copo (200 ml)", g: 200 }, { label: "xícara", g: 160 }]],
  [/^requeijao/, [{ label: "colher de sopa", g: 30 }]],
  [/^queijo/, [{ label: "fatia", g: 20 }, { label: "colher de sopa", g: 15 }]],
  [/^(manteiga|margarina)/, [{ label: "ponta de faca", g: 5 }, { label: "colher de chá", g: 5 }]],
  [/^(azeite|oleo)/, [{ label: "colher de sopa", g: 8 }, { label: "fio", g: 3 }]],
  [/^(acucar|mel|melado)/, [{ label: "colher de chá", g: 5 }, { label: "colher de sopa", g: 12 }]],
  [/^(farinha|farofa)/, [{ label: "colher de sopa", g: 15 }]],
  [/^biscoito/, [{ label: "unidade", g: 7 }, { label: "pacote pequeno", g: 30 }]],
  [/^(castanha|amendoim|noz|amendoa|pistache|avela|macadamia)/, [{ label: "punhado", g: 30 }, { label: "unidade", g: 4 }]],
  [/^banana/, [{ label: "unidade média", g: 86 }]],
  [/^maca/, [{ label: "unidade média", g: 130 }]],
  [/^laranja/, [{ label: "unidade média", g: 180 }]],
  [/^mamao/, [{ label: "fatia", g: 170 }]],
  [/^melancia|^melao/, [{ label: "fatia", g: 200 }]],
  [/^abacate/, [{ label: "colher de sopa", g: 30 }]],
  [/^(morango|uva|acerola|amora)/, [{ label: "xícara", g: 140 }, { label: "unidade", g: 12 }]],
  [/^(batata|mandioca|inhame|cara|aipim)/, [{ label: "colher de servir", g: 70 }, { label: "unidade média", g: 140 }]],
  [/^(alface|rucula|agriao|couve|espinafre|almeirao|acelga|repolho)/, [{ label: "prato de sobremesa", g: 30 }, { label: "colher de servir", g: 25 }]],
];

const CATEGORY: Record<number, Portion[]> = {
  2: [{ label: "colher de sopa", g: 25 }],
  3: [{ label: "unidade média", g: 120 }],
  5: [{ label: "filé médio", g: 120 }, { label: "porção", g: 100 }],
  6: [{ label: "porção", g: 100 }, { label: "bife / filé médio", g: 120 }],
  13: [{ label: "porção", g: 150 }, { label: "prato", g: 300 }],
};

export function portionsFor(name: string, category?: number): Portion[] {
  const n = norm(name);
  const rule = RULES.find(([re]) => re.test(n))?.[1] ?? (category ? CATEGORY[category] : undefined) ?? [];
  return [...rule, { label: "100 g", g: 100 }];
}

type TacoRow = [number, string, number, number, number, number, number, number];
type SupplementRow = { name: string; brand: string; serving_label: string; serving_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number };

const per100 = (v: number, g: number) => (g > 0 ? (v / g) * 100 : 0);

export const TACO: Food[] = (taco as TacoRow[]).map(([id, name, cat, kcal, protein, carbs, fat]) => {
  const n = pretty(name);
  return { key: `taco:${id}`, name: n, source: "taco", kcal, protein, carbs, fat, portions: portionsFor(name, cat), search: norm(`${n} ${name}`) };
});

export const fromServing = (key: string, source: Food["source"], s: SupplementRow): Food => ({
  key,
  name: s.name,
  brand: s.brand || undefined,
  source,
  kcal: per100(s.kcal, s.serving_g),
  protein: per100(s.protein_g, s.serving_g),
  carbs: per100(s.carbs_g, s.serving_g),
  fat: per100(s.fat_g, s.serving_g),
  portions: [{ label: s.serving_label, g: s.serving_g }],
  search: norm(`${s.name} ${s.brand ?? ""}`),
});

export const SUPPLEMENTS: Food[] = (supplements as SupplementRow[]).map((s, i) => fromServing(`supl:${i}`, "suplemento", s));

/** Itens já registrados viram atalhos: mesmo nome, mesma porção. */
export function fromHistory(items: FoodItem[]): Food[] {
  const seen = new Map<string, Food>();
  for (const it of items) {
    const k = norm(it.name);
    if (!k || seen.has(k) || !it.grams) continue;
    seen.set(k, {
      key: `hist:${k}`,
      name: it.name,
      source: "recente",
      kcal: per100(it.kcal, it.grams),
      protein: per100(it.protein_g, it.grams),
      carbs: per100(it.carbs_g, it.grams),
      fat: per100(it.fat_g, it.grams),
      portions: [{ label: it.quantity || `${Math.round(it.grams)} g`, g: it.grams }, ...portionsFor(it.name).filter((p) => p.g !== it.grams)],
      search: k,
    });
  }
  return [...seen.values()];
}

const SOURCE_WEIGHT: Record<Food["source"], number> = { meu: 0, recente: 1, suplemento: 2, taco: 3 };

/** Busca por prefixo de palavras, sem acento. Cada termo precisa aparecer no início de alguma palavra. */
export function searchFoods(query: string, pool: Food[], limit = 8): Food[] {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.length) return [];
  const scored: { f: Food; s: number }[] = [];
  for (const f of pool) {
    const words = f.search.split(" ");
    let score = 0;
    let ok = true;
    for (const t of terms) {
      const i = words.findIndex((w) => w.startsWith(t));
      if (i < 0) { ok = false; break; }
      score += i + (words[i] === t ? 0 : 0.5);
    }
    if (!ok) continue;
    // nomes curtos e itens pessoais primeiro; "cru" por último
    score += SOURCE_WEIGHT[f.source] * 1.5 + words.length * 0.15 + (/\bcrua?s?\b/.test(f.search) ? 2 : 0);
    scored.push({ f, s: score });
  }
  return scored.sort((a, b) => a.s - b.s).slice(0, limit).map((x) => x.f);
}

export function nutrition(f: Food, grams: number) {
  const k = grams / 100;
  return {
    kcal: Math.round(f.kcal * k),
    protein_g: Math.round(f.protein * k * 10) / 10,
    carbs_g: Math.round(f.carbs * k * 10) / 10,
    fat_g: Math.round(f.fat * k * 10) / 10,
  };
}
