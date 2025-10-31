export type Format = "sections" | "bullets" | "paragraphs";

export interface Style {
  tone?: string;
  use_emojis?: boolean;
  length_words?: number;
  format?: Format;
  audience?: string;
  language?: "es" | "en";
}

export interface ChatInPayload {
  query: string;
  top_k?: number;
  style?: Style;
  thread_id?: string | null;
}

export interface Chunk { content: string; similarity: number }
export interface ChatOut { answer: string; retrieved: Chunk[] }

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

export async function llmComplete(
  payload: ChatInPayload,
  signal?: AbortSignal
): Promise<ChatOut> {
  const r = await fetch(`${API_BASE}/llm/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`LLM error ${r.status}: ${txt || r.statusText}`);
  }
  return r.json();
}

