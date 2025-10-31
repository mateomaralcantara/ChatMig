import type { Response as ExResponse } from "express";

export function setNdjsonHeaders(res: ExResponse) {
  if (res.headersSent) return;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx
}

export function writeDelta(res: ExResponse, text: string) {
  if (!text) return;
  setNdjsonHeaders(res);
  res.write(JSON.stringify({ type: "delta", content: text }) + "\n");
}

export function end(res: ExResponse) {
  if (!res.writableEnded) res.end();
}

/** Itera un ReadableStream<Uint8Array> y devuelve strings decodificadas */
export async function* iterateText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
  } finally {
    try { reader.releaseLock(); } catch {}
  }
}

/** Divide en líneas preservando buffer final incompleto */
export function lineBreaker() {
  let buf = "";
  return (chunk: string): string[] => {
    buf += chunk;
    const parts = buf.split(/\r?\n/);
    buf = parts.pop() ?? "";
    return parts;
  };
}

/** Parse rápido SSE -> JSON (OpenAI/Mistral/Cohere) */
export function parseSseData(line: string): string | null {
  // Ejemplos:
  // "data: { ...json... }"
  // "data: [DONE]"
  const m = /^data:\s*(.*)$/.exec(line);
  if (!m) return null;
  return m[1];
}

/** Extrae texto robustamente de varios proveedores (stream) */
export function pickTextFromAny(json: any): string {
  // OpenAI/Mistral (chat.completions stream)
  const c0 = json?.choices?.[0];
  const delta = c0?.delta?.content ?? c0?.message?.content ?? c0?.text ?? "";
  if (typeof delta === "string" && delta) return delta;

  // Anthropic (content_block_delta)
  const ant = json?.delta?.text ?? json?.content_block?.text ?? "";
  if (typeof ant === "string" && ant) return ant;

  // Cohere (event chunks with { text })
  const coh = json?.text ?? "";
  if (typeof coh === "string" && coh) return coh;

  // Gemini (candidates[].content.parts[].text)
  const parts = json?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const joined = parts.map((p: any) => p?.text ?? "").join("");
    if (joined) return joined;
  }

  // Bedrock Meta ({"generation":"..."})
  const gen = json?.generation ?? json?.output_text ?? "";
  if (typeof gen === "string" && gen) return gen;

  return "";
}

/** Junta messages o usa query para construir prompt simple */
export function toPrompt(req: Required<import("../types").ChatRequest>): string {
  if (req.messages?.length) {
    return req.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
  }
  return String(req.query ?? "");
}

/** Convierte ChatRequest opcional a Required con defaults seguros */
export function finalize(req: import("../types").ChatRequest): Required<import("../types").ChatRequest> {
  return {
    model: req.model ?? "",
    messages: req.messages ?? [],
    query: req.query ?? "",
    temperature: req.temperature ?? 0.2,
    top_p: req.top_p ?? 0.95,
    max_tokens: req.max_tokens ?? 1024,
    meta: req.meta ?? {},
  };
}

