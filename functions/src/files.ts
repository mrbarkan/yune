// Arquivo do Storage → blocos de conteúdo para o Claude (usado por importDietPlan e readHealthDoc).
import type Anthropic from "@anthropic-ai/sdk";
import { getStorage } from "firebase-admin/storage";
import mammoth from "mammoth";

const MAX_TEXT = 60_000;
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export async function fileContent(path: string, maxBytes: number): Promise<Anthropic.ContentBlockParam[] | string> {
  const file = getStorage().bucket().file(path);
  const [meta] = await file.getMetadata().catch(() => [null]);
  if (!meta) return "Arquivo não encontrado. Envie de novo.";
  if (Number(meta.size) > maxBytes) return "Arquivo grande demais (máx. 10 MB).";
  const type = String(meta.contentType ?? "");
  const [buf] = await file.download();

  if (type === "application/pdf") {
    return [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } }];
  }
  if (IMAGE_TYPES.includes(type as (typeof IMAGE_TYPES)[number])) {
    return [{ type: "image", source: { type: "base64", media_type: type as (typeof IMAGE_TYPES)[number], data: buf.toString("base64") } }];
  }
  if (type === DOCX) {
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return [{ type: "text", text: value.slice(0, MAX_TEXT) }];
  }
  if (type.startsWith("text/")) return [{ type: "text", text: buf.toString("utf8").slice(0, MAX_TEXT) }];
  return "Formato não suportado. Use PDF, Word (.docx), texto ou foto.";
}
