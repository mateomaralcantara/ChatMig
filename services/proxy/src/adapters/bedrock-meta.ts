import type { Adapter } from "../types";
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand } from "@aws-sdk/client-bedrock-runtime";
import { setNdjsonHeaders, writeDelta, end, finalize, toPrompt } from "../utils/stream";

const region = process.env.AWS_REGION || "us-east-1";
const client = new BedrockRuntimeClient({ region });

/**
 * NOTA:
 *  - Meta Llama 3.x en Bedrock puede aceptar distintos formatos.
 *  - Este stub usa el formato "prompt"/"generation_config" (json) para simplificar.
 *  - Ajusta el 'modelId' a tu variante exacta (ej: "meta.llama3-70b-instruct-v1:0").
 */
const defaultModelId = "meta.llama3-8b-instruct-v1:0";

export const bedrockMeta: Adapter = {
  async stream(req0, res) {
    const req = finalize(req0);
    setNdjsonHeaders(res);

    const modelId = req.model || defaultModelId;
    const prompt = toPrompt(req);

    const payload = {
      prompt,
      max_gen_len: req.max_tokens,
      temperature: req.temperature,
      top_p: req.top_p,
    };

    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(JSON.stringify(payload)),
    });

    const out = await client.send(command);
    const stream = out.body;
    if (!stream) return end(res);

    for await (const evt of stream) {
      // cada 'chunk' tiene .chunk?.bytes (Uint8Array)
      // suele venir JSON con {"generation":"..."}
      const bytes = (evt as any)?.chunk?.bytes as Uint8Array | undefined;
      if (!bytes) continue;
      const text = new TextDecoder().decode(bytes);
      try {
        const json = JSON.parse(text);
        const piece = json?.generation ?? json?.output_text ?? "";
        if (piece) writeDelta(res, piece);
      } catch {
        writeDelta(res, text);
      }
    }
    end(res);
  },

  async complete(req0): Promise<string> {
    const req = finalize(req0);
    const modelId = req.model || defaultModelId;
    const prompt = toPrompt(req);

    const payload = {
      prompt,
      max_gen_len: req.max_tokens,
      temperature: req.temperature,
      top_p: req.top_p,
    };

    const r = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: new TextEncoder().encode(JSON.stringify(payload)),
      })
    );
    const buf = r.body as Uint8Array;
    const text = new TextDecoder().decode(buf);
    try {
      const json = JSON.parse(text);
      const out = json?.generation ?? json?.output_text ?? "";
      return String(out || "").trim();
    } catch {
      return text.trim();
    }
  },
};

