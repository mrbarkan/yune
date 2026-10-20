import taco from "@/data/taco.json";
import supplements from "@/data/supplements.json";
import common from "@/data/common.json";
import type { FoodItem } from "./firebase";

export type Portion = { label: string; g: number };

/** Alimento normalizado: valores por 100 g + medidas caseiras. */
export type Food = {
  key: string;
  preferred?: boolean;
  name: string;
  brand?: string;
  source: "taco" | "comum" | "suplemento" | "meu" | "recente";
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
  "Cerveja, pilsen 2": "Cerveja pilsen",
};

// Outros nomes pelos quais as pessoas procuram o mesmo alimento.
const ALIASES: [RegExp, string][] = [
  [/\bmozarela\b/, "mussarela mucarela"],
  [/\bquibe\b/, "kibe"],
  [/\bestrogonofe\b/, "strogonoff estrogonoff"],
  [/\bmoido\b/, "moida"],
  [/\btangerina\b/, "mexerica bergamota"],
  [/\bbiscoito\b/, "bolacha"],
  [/\bmandioca\b/, "aipim macaxeira"],
  [/\babobora\b/, "jerimum"],
  [/\bcafe infusao\b/, "coado"],
  [/\bcana aguardente\b/, "cachaca pinga"],
  [/\brefrigerante tipo cola\b/, "coca"],
  [/\bpao trigo frances\b/, "pao de sal cacetinho"],
];

const searchText = (s: string) => {
  const n = norm(s);
  return [n, ...ALIASES.filter(([re]) => re.test(n)).map(([, a]) => a)].join(" ");
};

// Entre várias versões, a mais comum aparece primeiro ("banana" → prata, não figo).
const PREFERRED = new Set([
  "Banana, prata, crua", "Banana, nanica, crua", "Maçã, Fuji, com casca, crua", "Arroz, tipo 1, cozido", "Feijão, carioca, cozido",
  "Leite, de vaca, integral", "Café, infusão 10%", "Frango, peito, sem pele, grelhado", "Ovo, de galinha, inteiro, cozido/10minutos",
  "Batata, inglesa, cozida", "Laranja, pêra, crua", "Mamão, Papaia, cru", "Queijo, minas, frescal", "Pão, trigo, francês",
]);

/** "Feijão, carioca, cozido" → "Feijão carioca, cozido" */
const pretty = (n: string) => RENAME[n] ?? n.replace(/^([^,]+), ([^,]+)/, "$1 $2");
// Fruta se come crua: "Banana, prata, crua" vira só "Banana prata".
const prettyFruit = (n: string) => pretty(n).replace(/, crua?$/, "");

// Medidas caseiras por padrão de nome (primeira regra que casar vence).
const RULES: [RegExp, Portion[]][] = [
  [/^leite condensado|^creme de leite|^doce de leite/, [{ label: "colher de sopa", g: 20 }]],
  [/^acai/, [{ label: "copo (300 ml)", g: 300 }, { label: "tigela (500 ml)", g: 500 }]],
  [/^(coxinha|risole)/, [{ label: "unidade (lanchonete)", g: 110 }, { label: "unidade (festa)", g: 25 }]],
  [/^quibe (assado|frito)/, [{ label: "unidade (lanchonete)", g: 80 }, { label: "unidade (festa)", g: 25 }]],
  [/^pastel/, [{ label: "unidade (feira)", g: 110 }, { label: "pastelzinho", g: 25 }]],
  [/^empada/, [{ label: "unidade", g: 60 }]],
  [/^bolo/, [{ label: "fatia", g: 60 }]],
  [/^(presunto|apresuntado|mortadela|salame)/, [{ label: "fatia", g: 15 }]],
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

// Itens contados por unidade ganham tamanhos, para dar para dizer "banana grande" sem pesar.
const withSizes = (ps: Portion[]): Portion[] => {
  const i = ps.findIndex((p) => /^unidade( media)?$/.test(norm(p.label)));
  if (i < 0 || ps.some((p) => /pequen|grande/.test(norm(p.label)))) return ps;
  const g = ps[i].g;
  return [...ps.slice(0, i + 1), { label: "unidade pequena", g: Math.round(g * 0.7) }, { label: "unidade grande", g: Math.round(g * 1.4) }, ...ps.slice(i + 1)];
};

type CommonRow = { name: string; aka?: string; kcal: number; protein: number; carbs: number; fat: number; portions: [string, number][] };
const COMMON_PORTIONS = new Map((common as CommonRow[]).map((c) => [norm(c.name), c.portions.map(([label, g]) => ({ label, g }))]));

export function portionsFor(name: string, category?: number): Portion[] {
  const n = norm(name);
  const rule = COMMON_PORTIONS.get(n) ?? RULES.find(([re]) => re.test(n))?.[1] ?? (category ? CATEGORY[category] : undefined) ?? [];
  return withSizes([...rule, { label: "100 g", g: 100 }]);
}

type TacoRow = [number, string, number, number, number, number, number, number];
type SupplementRow = { name: string; brand: string; serving_label: string; serving_g: number; kcal: number; protein_g: number; carbs_g: number; fat_g: number };

const per100 = (v: number, g: number) => (g > 0 ? (v / g) * 100 : 0);

export const TACO: Food[] = (taco as TacoRow[]).map(([id, name, cat, kcal, protein, carbs, fat]) => {
  const n = cat === 3 ? prettyFruit(name) : pretty(name);
  return { key: `taco:${id}`, preferred: PREFERRED.has(name) || undefined, name: n, source: "taco", kcal, protein, carbs, fat, portions: portionsFor(name, cat), search: searchText(`${n} ${name}`) };
});

/** Pratos e itens do dia a dia que a TACO não tem (croissant, pizza, sorvete…): valores médios por 100 g. */
export const COMMON: Food[] = (common as CommonRow[]).map((c, i) => ({
  key: `comum:${i}`, name: c.name, source: "comum", kcal: c.kcal, protein: c.protein, carbs: c.carbs, fat: c.fat,
  portions: portionsFor(c.name), search: searchText(`${c.name} ${c.aka ?? ""}`),
}));

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
  search: searchText(`${s.name} ${s.brand ?? ""}`),
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
      search: searchText(it.name),
    });
  }
  return [...seen.values()];
}

const SOURCE_WEIGHT: Record<Food["source"], number> = { meu: 0, recente: 1, suplemento: 2, comum: 3, taco: 3 };

// Palavras de ligação não precisam casar ("suco de laranja" acha "Laranja, baía, suco").
const STOP = new Set(["de", "da", "do", "das", "dos", "com", "e", "a", "o", "em", "na", "no"]);

/** "croissants" → croissant, "pães" → pao, "colheres" → colher */
const variants = (t: string) =>
  [t, t.replace(/[ao]es$/, "ao"), t.replace(/([rsz])es$/, "$1"), t.replace(/s$/, "")].filter((v, i, a) => v.length >= 2 && a.indexOf(v) === i);

/** Busca por prefixo de palavras, sem acento. Cada termo precisa aparecer no início de alguma palavra. */
export function searchFoods(query: string, pool: Food[], limit = 8): Food[] {
  const terms = norm(query).split(" ").filter(Boolean);
  if (!terms.some((t) => !STOP.has(t))) return [];
  const scored: { f: Food; s: number }[] = [];
  for (const f of pool) {
    const words = f.search.split(" ");
    let score = 0;
    let ok = true;
    for (const t of terms) {
      if (STOP.has(t)) continue;
      const vs = variants(t);
      // Palavra exata em qualquer posição vale mais que começo de palavra ("coca" → cola, não cocada).
      const exact = words.findIndex((w) => vs.includes(w));
      const i = exact >= 0 ? exact : words.findIndex((w) => vs.some((v) => w.startsWith(v)));
      if (i < 0) {
        ok = false;
        break;
      }
      score += Math.min(i, 2) * 0.5 + (exact >= 0 ? 0 : 1.5);
    }
    if (!ok) continue;
    // nomes curtos e itens pessoais primeiro; "cru" por último
    const name = norm(f.name);
    score += SOURCE_WEIGHT[f.source] * 1.5 + name.split(" ").length * 0.15 + (/\b(crua?s?|po|mistura para)\b/.test(name) ? 2 : 0) - (f.preferred ? 1 : 0);
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

export type Parsed = {
  text: string;
  qty: number;
  amount: { g: number; unit: "g" | "ml" } | null;
  size: "pequen" | "medi" | "grand" | null;
  measure: string | null;
};

const MEASURES = new Set(["copo", "xicara", "caneca", "colher", "fatia", "concha", "escumadeira", "pegador", "lata", "taca", "pedaco",
  "prato", "bola", "porcao", "pote", "unidade", "dose", "tigela", "punhado", "file", "bife", "sache", "dosador", "scoop"]);

const NUMBER_WORDS: Record<string, number> = { meio: 0.5, meia: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5 };
const toNumber = (s: string) => (s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : NUMBER_WORDS[s] ?? Number(s.replace(",", ".")));

/** Quantidade e tamanho digitados junto com o alimento: "2 croissants", "pizza 150 g", "banana grande", "meia tapioca". */
export function parseQuery(raw: string): Parsed {
  let s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let amount: Parsed["amount"] = null;
  s = s.replace(/(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml)\b/, (_, n: string, u: string) => {
    amount = { g: Number(n.replace(",", ".")), unit: u === "ml" ? "ml" : "g" };
    return " ";
  });
  let qty = 1;
  s = s.trim().replace(/^(\d+(?:[.,]\d+)?|\d+\/\d+|meio|meia|uma?|dois|duas|tres|quatro|cinco)\s*(?:x\s+|\s+)/, (_, n: string) => {
    qty = toNumber(n) || 1;
    return "";
  });
  let size: Parsed["size"] = null;
  s = s.replace(/\b(pequen|medi|grand)[a-z]*\b|\bmini\b/, (_m, k?: string) => {
    size = (k ?? "pequen") as Parsed["size"];
    return " ";
  });
  // "2 copos de leite", "1 colher de sopa de azeite": a medida escolhe a porção e sai da busca.
  let measure: string | null = null;
  const words = norm(s).split(" ").filter(Boolean);
  const i = words.findIndex((w) => variants(w).some((v) => MEASURES.has(v)));
  if (i >= 0 && words.length > 1) {
    measure = variants(words[i]).find((v) => MEASURES.has(v))!;
    let n = 1;
    if (measure === "colher" && words[i + 1] === "de" && /^(sopa|cha|servir|sobremesa)$/.test(words[i + 2] ?? "")) {
      measure = `colher de ${words[i + 2]}`;
      n = 3;
    }
    if (STOP.has(words[i + n])) n++;
    words.splice(i, n);
  }
  return { text: words.join(" "), qty, amount, size, measure };
}

/** Porção que o texto pediu, ou a primeira do alimento. */
export function pickPortion(f: Food, p: Parsed): Portion {
  if (p.amount) return { label: `${fmtAmount(p.amount.g)} ${p.amount.unit}`, g: p.amount.g };
  const by = (k: string | null) => (k ? f.portions.find((x) => norm(x.label).includes(k)) : undefined);
  return by(p.measure) ?? by(p.size) ?? f.portions[0];
}

const fmtAmount = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
