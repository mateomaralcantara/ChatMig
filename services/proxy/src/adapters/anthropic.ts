import type { Adapter } from "../types";
import { iterateText, lineBreaker, parseSseData, pickTextFromAny, setNdjsonHeaders, writeDelta, end, finalize } from "../utils/stream";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function headers() {
  const key = process.env.ANTHROPIC_API_KEY || "";
  return {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
}

export const anthropic: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);

    const body = {
      model: req.model || "claude-3-haiku-20240307",
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      messages: (req.messages?.length
        ? req.messages
        : [{ role: "user", content: req.query }]),
      stream: true,
    };

    const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok || !r.body) {
      writeDelta(res, `Error HTTP ${r.status}`);
      return end(res);
    }

    // Anthropic stream: SSE con líneas "event: ...", "data: {...}"
    const breakLines = lineBreaker();
    let currentEvent = "";
    for await (const chunk of iterateText(r.body)) {
      const lines = breakLines(chunk);
      for (const line of lines) {
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        const data = parseSseData(line);
        if (!data) continue;

        if (data === "[DONE]" || currentEvent === "message_stop") return end(res);

        try {
          const json = JSON.parse(data);
          // content_block_delta with delta.text
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
      model: req.model || "claude-3-haiku-20240307",
      max_tokens: req.max_tokens,
      temperature: req.temperature,
      messages: (req.messages?.length
        ? req.messages
        : [{ role: "user", content: req.query }]),
      stream: false,
    };
    const r = await fetch(ANTHROPIC_URL, { method: "POST", headers: headers(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}`);
    const data = await r.json();
    const text = data?.content?.map?.((b: any) => b?.text ?? "").join("") ?? "";
    return text.trim();
  },
};

