// Estima calorias de uma refeição (texto e/ou foto do prato) ou lê um rótulo nutricional.
// Requer o segredo ANTHROPIC_API_KEY (firebase functions:secrets:set ANTHROPIC_API_KEY).
import Anthropic from "@anthropic-ai/sdk";
import { defineSecret } from "firebase-functions/params";
import { onCall } from "firebase-functions/v2/https";
import { REGION } from "./region.js";
import { bumpUsage } from "./usage.js";

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const DAILY_LIMIT = 80;
const MAX_IMAGE_B64 = 7_000_000; // ~5 MB
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

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

// Como as outras funções do Yune, devolve sempre um objeto: o resultado ou `{ error }`.
export const estimateFood = onCall(
  { region: REGION, secrets: [ANTHROPIC_API_KEY], memory: "512MiB", timeoutSeconds: 60 },
  async (req) => {
    if (!req.auth || req.auth.token.email_verified !== true) return { error: "Faça login para continuar." };

    const body = (req.data ?? {}) as Record<string, unknown>;
    const mode: "meal" | "label" = body.mode === "label" ? "label" : "meal";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const image = body.image as { data?: string; media_type?: string } | undefined;

    if (description.length > 600) return { error: "Descrição longa demais (máx. 600 caracteres)." };
    if (image && (typeof image.data !== "string" || image.data.length > MAX_IMAGE_B64 ||
        !IMAGE_TYPES.includes(image.media_type as (typeof IMAGE_TYPES)[number]))) {
      return { error: "Imagem inválida ou grande demais." };
    }
    if (!description && !image) return { error: mode === "label" ? "Envie a foto do rótulo." : "Descreva ou fotografe a refeição." };

    if ((await bumpUsage(req.auth.uid)) > DAILY_LIMIT) {
      return { error: "Limite diário de estimativas atingido. Use a busca ou informe as calorias." };
    }

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

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-5-5",
        max_tokens: 4000,
        output_config: { effort: "low", format: { type: "json_schema", schema: mode === "label" ? LABEL_SCHEMA : MEAL_SCHEMA } },
        system: mode === "label" ? LABEL_SYSTEM : MEAL_SYSTEM,
        messages: [{ role: "user", content }],
      });

      if (response.stop_reason === "refusal") return { error: "Não consegui analisar isso." };
      const text = response.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return { error: "Resposta vazia. Tente de novo." };
      return JSON.parse(text.text);
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) return { error: "Muitas requisições. Tente em instantes." };
      if (err instanceof Anthropic.APIError) return { error: `Falha na estimativa (${err.status}).` };
      return { error: "Falha na estimativa." };
    }
  },
);
