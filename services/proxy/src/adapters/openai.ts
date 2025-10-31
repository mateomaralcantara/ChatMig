import type { Adapter, ChatRequest } from "../types";
import { iterateText, lineBreaker, parseSseData, pickTextFromAny, setNdjsonHeaders, writeDelta, end, finalize } from "../utils/stream";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function headers() {
  const key = process.env.OPENAI_API_KEY || "";
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${key}`,
  };
}

export const openai: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);

    const body = {
      model: req.model || "gpt-4o-mini",
      messages: (req.messages?.length
        ? req.messages
        : [{ role: "user", content: req.query }]),
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: true,
    };

    const r = await fetch(OPENAI_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => "");
      writeDelta(res, `Error HTTP ${r.status} ${text}`);
      return end(res);
    }

    const breakLines = lineBreaker();
    for await (const chunk of iterateText(r.body)) {
      const lines = breakLines(chunk);
      for (const line of lines) {
        const data = parseSseData(line);
        if (!data) continue;
        if (data === "[DONE]") return end(res);
        try {
          const json = JSON.parse(data);
          const piece = pickTextFromAny(json);
          if (piece) writeDelta(res, piece);
        } catch {
          // si no es JSON, lo tratamos como texto
          writeDelta(res, data);
        }
      }
    }
    end(res);
  },

  async complete(req0): Promise<string> {
    const req = finalize(req0);
    const body = {
      model: req.model || "gpt-4o-mini",
      messages: (req.messages?.length
        ? req.messages
        : [{ role: "user", content: req.query }]),
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: false,
    };
    const r = await fetch(OPENAI_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`OpenAI HTTP ${r.status}`);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  },
};

