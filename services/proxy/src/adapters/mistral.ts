import type { Adapter } from "../types";
import { iterateText, lineBreaker, parseSseData, pickTextFromAny, setNdjsonHeaders, writeDelta, end, finalize } from "../utils/stream";

const URL = "https://api.mistral.ai/v1/chat/completions";

function headers() {
  const key = process.env.MISTRAL_API_KEY || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

export const mistral: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);

    const body = {
      model: req.model || "mistral-small-latest",
      messages: (req.messages?.length ? req.messages : [{ role: "user", content: req.query }]),
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: true,
    };

    const r = await fetch(URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      writeDelta(res, `Error HTTP ${r.status}`);
      return end(res);
    }

    // SSE similar a OpenAI
    const breakLines = lineBreaker();
    for await (const chunk of iterateText(r.body)) {
      for (const line of breakLines(chunk)) {
        const data = parseSseData(line);
        if (!data) continue;
        if (data === "[DONE]") return end(res);
        try {
          const json = JSON.parse(data);
          const piece = pickTextFromAny(json);
          if (piece) writeDelta(res, piece);
        } catch {
          writeDelta(res, data);
        }
      }
    }
    end(res);
  },

  async complete(req0): Promise<string> {
    const req = finalize(req0);
    const body = {
      model: req.model || "mistral-small-latest",
      messages: (req.messages?.length ? req.messages : [{ role: "user", content: req.query }]),
      temperature: req.temperature,
      top_p: req.top_p,
      max_tokens: req.max_tokens,
      stream: false,
    };
    const r = await fetch(URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Mistral HTTP ${r.status}`);
    const data = await r.json();
    return data?.choices?.[0]?.message?.content?.trim?.() ?? "";
  },
};

