import type { Adapter } from "../types";
import { iterateText, lineBreaker, parseSseData, pickTextFromAny, setNdjsonHeaders, writeDelta, end, finalize } from "../utils/stream";

const URL = "https://api.cohere.com/v1/chat";

function headers() {
  const key = process.env.COHERE_API_KEY || "";
  return { "Content-Type": "application/json", Authorization: `Bearer ${key}` };
}

export const cohere: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);
    const body = {
      model: req.model || "command-r-plus",
      message: req.messages?.length ? req.messages.map(m => `${m.role}: ${m.content}`).join("\n") : req.query,
      temperature: req.temperature,
      p: req.top_p,
      max_tokens: req.max_tokens,
      stream: true,
    };

    const r = await fetch(URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      writeDelta(res, `Error HTTP ${r.status}`);
      return end(res);
    }

    const breakLines = lineBreaker();
    // Cohere: SSE con distintos 'event:', usamos sólo data para texto incremental
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
      model: req.model || "command-r-plus",
      message: req.messages?.length ? req.messages.map(m => `${m.role}: ${m.content}`).join("\n") : req.query,
      temperature: req.temperature,
      p: req.top_p,
      max_tokens: req.max_tokens,
      stream: false,
    };
    const r = await fetch(URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Cohere HTTP ${r.status}`);
    const data = await r.json();
    // distintas versiones pueden devolver .text o .response.text
    const txt = data?.text ?? data?.response?.text ?? "";
    return String(txt || "").trim();
  },
};

