// Estima calorias e macros de uma refeição descrita em linguagem natural.
// Requer o segredo ANTHROPIC_API_KEY (supabase secrets set ANTHROPIC_API_KEY=...).
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `Você é uma nutricionista brasileira. A pessoa descreve o que comeu, em português, \
do jeito que falaria com uma amiga. Separe em itens e estime calorias e macronutrientes de cada um, \
usando como referência a Tabela TACO e porções caseiras brasileiras. Quando a quantidade não for dita, \
assuma uma porção típica e deixe isso explícito no campo "quantity" (ex.: "1 concha média (~140 g)"). \
Seja realista, sem arredondar para baixo. Se o texto não descrever comida ou bebida, devolva items vazio \
e explique em "notes".`;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "total_kcal", "notes"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "quantity", "kcal", "protein_g", "carbs_g", "fat_g"],
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          kcal: { type: "integer" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
      },
    },
    total_kcal: { type: "integer" },
    notes: { type: "string" },
  },
};

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Faça login para continuar." });

  const { description } = await req.json().catch(() => ({}));
  if (typeof description !== "string" || !description.trim()) return json({ error: "Descreva a refeição." });
  if (description.length > 600) return json({ error: "Descrição longa demais (máx. 600 caracteres)." });

  try {
    // deno-lint-ignore no-explicit-any
    const params: any = {
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema } },
      system: SYSTEM,
      messages: [{ role: "user", content: description.trim() }],
    };
    const response = await anthropic.beta.messages.create(params);

    if (response.stop_reason === "refusal") return json({ error: "Não consegui estimar essa refeição." });
    const text = response.content.find((b: { type: string }) => b.type === "text") as { text: string } | undefined;
    if (!text) return json({ error: "Resposta vazia. Tente de novo." });
    return json(JSON.parse(text.text));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Muitas requisições. Tente em instantes." });
    if (err instanceof Anthropic.APIError) return json({ error: `Falha na estimativa (${err.status}).` });
    return json({ error: "Falha na estimativa." });
  }
});
