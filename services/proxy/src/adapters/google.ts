import type { Adapter } from "../types";
import { iterateText, lineBreaker, pickTextFromAny, setNdjsonHeaders, writeDelta, end, finalize } from "../utils/stream";

// v1beta suele ser más permisivo para stream
const API = (model: string, op: "stream" | "complete") =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${op === "stream" ? "streamGenerateContent" : "generateContent"}?key=${encodeURIComponent(process.env.GOOGLE_API_KEY || "")}`;

export const google: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);
    const model = req.model || "gemini-1.5-pro";

    const body = {
      contents: req.messages?.length
        ? req.messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }))
        : [{ role: "user", parts: [{ text: req.query }] }],
      generationConfig: {
        temperature: req.temperature,
        topP: req.top_p,
        maxOutputTokens: req.max_tokens,
      },
      safetySettings: [],
    };

    const r = await fetch(API(model, "stream"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok || !r.body) {
      writeDelta(res, `Error HTTP ${r.status}`);
      return end(res);
    }

    // Gemini stream retorna JSON por línea (no SSE formal)
    const breakLines = lineBreaker();
    for await (const chunk of iterateText(r.body)) {
      const lines = breakLines(chunk);
      for (const line of lines) {
        const text = line.trim();
        if (!text) continue;
        try {
          const json = JSON.parse(text);
          const piece = pickTextFromAny(json);
          if (piece) writeDelta(res, piece);
        } catch {
          writeDelta(res, text);
        }
      }
    }
    end(res);
  },

  async complete(req0): Promise<string> {
    const req = finalize(req0);
    const model = req.model || "gemini-1.5-pro";
    const body = {
      contents: req.messages?.length
        ? req.messages.map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] }))
        : [{ role: "user", parts: [{ text: req.query }] }],
      generationConfig: {
        temperature: req.temperature,
        topP: req.top_p,
        maxOutputTokens: req.max_tokens,
      },
      safetySettings: [],
    };
    const r = await fetch(API(model, "complete"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`Gemini HTTP ${r.status}`);
    const data = await r.json();
    const out =
      data?.candidates?.[0]?.content?.parts?.map?.((p: any) => p?.text ?? "")?.join("") ?? "";
    return out.trim();
  },
};

