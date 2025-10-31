import { Router } from "express";
import type { Adapter, Provider } from "../types";
import { openai } from "../adapters/openai";
import { anthropic } from "../adapters/anthropic";
import { google } from "../adapters/google";
import { mistral } from "../adapters/mistral";
import { cohere } from "../adapters/cohere";
import { bedrockMeta } from "../adapters/bedrock-meta";
import { finalize } from "../utils/stream";

const ADAPTERS: Record<Provider, Adapter> = {
  openai,
  anthropic,
  google,
  mistral,
  cohere,
  "bedrock-meta": bedrockMeta,
};

export const proxyRouter = Router();

/** STREAM → NDJSON {type:"delta", content:"..."} */
proxyRouter.post("/:provider/stream", async (req, res) => {
  try {
    const provider = String(req.params.provider) as Provider;
    const adapter = ADAPTERS[provider];
    if (!adapter) return res.status(404).json({ error: "Unknown provider" });

    // Normalizamos el body a Required<ChatRequest> para los adapters
    const body = finalize(req.body || {});
    await adapter.stream(body, res);
  } catch (e: any) {
    if (!res.headersSent) res.status(500).json({ error: e?.message || "stream error" });
    else try { res.end(); } catch {}
  }
});

/** COMPLETE → texto plano (fallback no-stream) */
proxyRouter.post("/:provider/complete", async (req, res) => {
  try {
    const provider = String(req.params.provider) as Provider;
    const adapter = ADAPTERS[provider];
    if (!adapter) return res.status(404).json({ error: "Unknown provider" });

    const body = finalize(req.body || {});
    const out = await adapter.complete(body);
    res.json({ text: out });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "complete error" });
  }
});
