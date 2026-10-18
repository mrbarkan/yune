// Estima calorias de uma refeição (texto e/ou foto do prato) ou lê um rótulo nutricional.
// Requer o segredo ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const DAILY_LIMIT = 80;
const MAX_IMAGE_B64 = 7_000_000; // ~5 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

const MEAL_SYSTEM = `Você é uma nutricionista brasileira. Você recebe a descrição e/ou a foto de uma refeição \
e separa em itens, estimando calorias e macronutrientes de cada um com base na Tabela TACO e em porções caseiras \
brasileiras. Na foto, estime a porção pelo tamanho do prato e dos talheres. Quando a quantidade não estiver clara, \
assuma uma porção típica e deixe explícito em "quantity" (ex.: "1 concha média (~140 g)"). Nomes curtos e comuns \
em português ("Arroz branco", "Feijão carioca", "Frango grelhado"). Seja realista, sem arredondar para baixo. \
Se não houver comida ou bebida, devolva items vazio e explique em "notes".`;

const LABEL_SYSTEM = `Você lê tabelas nutricionais de embalagens brasileiras (suplementos e industrializados). \
Extraia os valores POR PORÇÃO exatamente como impressos. "serving_label" deve ser curto, ex.: "1 dosador (30 g)". \
Se a foto não mostrar uma tabela nutricional legível, preencha o que conseguir e explique em "notes".`;

const item = {
  type: "object",
  additionalProperties: false,
  required: ["name", "quantity", "grams", "kcal", "protein_g", "carbs_g", "fat_g"],
  properties: {
    name: { type: "string" },
    quantity: { type: "string" },
    grams: { type: "number" },
    kcal: { type: "integer" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
  },
};

const MEAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "notes"],
  properties: { items: { type: "array", items: item }, notes: { type: "string" } },
};

const LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "brand", "serving_label", "serving_g", "kcal", "protein_g", "carbs_g", "fat_g", "notes"],
  properties: {
    name: { type: "string" },
    brand: { type: "string" },
    serving_label: { type: "string" },
    serving_g: { type: "number" },
    kcal: { type: "number" },
    protein_g: { type: "number" },
    carbs_g: { type: "number" },
    fat_g: { type: "number" },
    notes: { type: "string" },
  },
};

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Faça login para continuar." });

  const body = await req.json().catch(() => ({}));
  const mode: "meal" | "label" = body.mode === "label" ? "label" : "meal";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const image = body.image as { data?: string; media_type?: string } | undefined;

  if (description.length > 600) return json({ error: "Descrição longa demais (máx. 600 caracteres)." });
  if (image && (typeof image.data !== "string" || image.data.length > MAX_IMAGE_B64 ||
      !IMAGE_TYPES.includes(image.media_type as (typeof IMAGE_TYPES)[number]))) {
    return json({ error: "Imagem inválida ou grande demais." });
  }
  if (!description && !image) return json({ error: mode === "label" ? "Envie a foto do rótulo." : "Descreva ou fotografe a refeição." });

  const { data: calls } = await admin.rpc("bump_ai_usage", { p_user: user.id });
  if ((calls as number) > DAILY_LIMIT) return json({ error: "Limite diário de estimativas atingido. Use a busca ou informe as calorias." });

  const content: Anthropic.ContentBlockParam[] = [];
  if (image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.media_type as (typeof IMAGE_TYPES)[number], data: image.data! },
    });
  }
  content.push({
    type: "text",
    text: mode === "label"
      ? (description ? `Produto: ${description}` : "Leia o rótulo.")
      : (description || "Estime a refeição da foto."),
  });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: mode === "label" ? LABEL_SCHEMA : MEAL_SCHEMA } },
      system: mode === "label" ? LABEL_SYSTEM : MEAL_SYSTEM,
      messages: [{ role: "user", content }],
    });

    if (response.stop_reason === "refusal") return json({ error: "Não consegui analisar isso." });
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return json({ error: "Resposta vazia. Tente de novo." });
    return json(JSON.parse(text.text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Muitas requisições. Tente em instantes." });
    if (err instanceof Anthropic.APIError) return json({ error: `Falha na estimativa (${err.status}).` });
    return json({ error: "Falha na estimativa." });
  }
});
