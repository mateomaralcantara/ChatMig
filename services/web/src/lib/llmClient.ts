/* ============================================================================
   Cliente universal del proxy multi-LLM (frontend)
   - Streaming orden: Fetch NDJSON → XHR chunked (Safari) → fallback no-stream
   - Backoff exponencial con jitter para /complete
   - Normalización de errores + ganchos de telemetría
   - Clamping de max_tokens según catálogo del modelo
   ========================================================================== */

   import {
    ChatRequest,
    Provider,
    resolveModel,
    normalizeProvider,
    clampOutputTokens,
    toMessagesFromQuery,
    ChatStyle,            // <- necesario para garantizar Required<ChatRequest>
    ChatMessagePayload,   // <- necesario para garantizar Required<ChatRequest>
  } from "../types/llm";
  
  /* --------------------------------- Config --------------------------------- */
  
  export const API_BASE: string =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE) ??
    "http://127.0.0.1:8000";
  
  /* -------------------------------- Tipos ----------------------------------- */
  
  export interface StreamOptions {
    signal?: AbortSignal;
    timeoutMs?: number;          // Aplica al fallback /complete
    retry?: number;              // Reintentos en /complete (default 2)
    rafThrottle?: boolean;       // Throttling opcional con rAF para onUpdate
    onStart?: (meta: { provider: Provider; model: string; requestId: string }) => void;
    onToken?: (chunk: string) => void; // llamado por cada delta (si NDJSON)
    onComplete?: (full: string) => void;
    onError?: (err: LLMError) => void;
  }
  
  export type UpdateFn = (acc: string) => void;
  
  export interface LLMError {
    name: "AbortError" | "HTTPError" | "NetworkError" | "TimeoutError" | "UnknownError";
    status?: number;
    code?: string;
    message: string;
    cause?: unknown;
  }
  
  /* -------------------------------- Utils ----------------------------------- */
  
  function supportsFetchStreaming(): boolean {
    try {
      const RS = (window as any).ReadableStream;
      return !!(RS && typeof Response !== "undefined" && typeof (Response.prototype as any).body !== "undefined");
    } catch {
      return false;
    }
  }
  
  function rafThrottleWrap(fn: UpdateFn | undefined, enabled?: boolean): UpdateFn | undefined {
    if (!fn || !enabled) return fn;
    let queued = false;
    let last = "";
    return (acc: string) => {
      last = acc;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn(last);
      });
    };
  }
  
  function toErr(name: LLMError["name"], message: string, extra?: Partial<LLMError>): LLMError {
    return { name, message, ...extra };
  }
  
  async function postJSON<T>(
    url: string,
    body: unknown,
    opts: { signal?: AbortSignal; timeoutMs?: number; retry?: number }
  ): Promise<T> {
    const { signal, timeoutMs = 15000, retry = 2 } = opts;
  
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const baseDelay = 400;
  
    for (let attempt = 0; attempt <= retry; attempt++) {
      const ac = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = setTimeout(() => {
        try {
          ac?.abort();
        } catch {}
      }, timeoutMs);
  
      // Encadenar abort externo
      const linkAbort = () => {
        try {
          ac?.abort();
        } catch {}
      };
      try {
        signal?.addEventListener?.("abort", linkAbort, { once: true });
      } catch {}
  
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(body),
          signal: (ac?.signal || signal) as any,
        });
        clearTimeout(timer);
        try {
          signal?.removeEventListener?.("abort", linkAbort);
        } catch {}
  
        if (!res.ok) {
          // Reintentables: 429 / 5xx
          if ((res.status === 429 || (res.status >= 500 && res.status <= 599)) && attempt < retry) {
            const jitter = Math.random() * 120;
            await sleep(baseDelay * Math.pow(2, attempt) + jitter);
            continue;
          }
          const text = await (async () => {
            try {
              return await res.text();
            } catch {
              return "";
            }
          })();
          throw toErr("HTTPError", `HTTP ${res.status}`, { status: res.status, cause: text });
        }
  
        return (await res.json()) as T;
      } catch (e: any) {
        clearTimeout(timer);
        try {
          signal?.removeEventListener?.("abort", linkAbort);
        } catch {}
  
        // Abort explícito
        if (signal && (signal as any).aborted) throw toErr("AbortError", "Aborted by caller");
  
        // Reintentos por red genérica
        const isNet = e?.name === "TypeError" || e?.message?.includes?.("Network");
        if (isNet && attempt < retry) {
          const jitter = Math.random() * 120;
          await sleep(baseDelay * Math.pow(2, attempt) + jitter);
          continue;
        }
        if (e?.name === "HTTPError") throw e;
        throw toErr("NetworkError", e?.message || "Network error", { cause: e });
      }
    }
    throw toErr("UnknownError", "Unexpected error");
  }
  
  function streamXHR(
    url: string,
    payload: unknown,
    onChunk: UpdateFn,
    signal?: AbortSignal,
    onToken?: StreamOptions["onToken"]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let acc = "";
      let lastIdx = 0;
  
      xhr.open("POST", url, true);
      try {
        xhr.responseType = "text";
      } catch {}
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Accept", "text/plain, application/x-ndjson");
  
      const abort = () => {
        try {
          xhr.abort();
        } catch {}
        reject(toErr("AbortError", "Aborted by caller"));
      };
      signal?.addEventListener?.("abort", abort, { once: true });
  
      xhr.onreadystatechange = () => {
        try {
          if (xhr.readyState === 3 || xhr.readyState === 4) {
            const text = xhr.responseText || "";
            if (text.length > lastIdx) {
              const chunk = text.slice(lastIdx);
              lastIdx = text.length;
  
              // Intentar NDJSON rápido
              const lines = chunk.split("\n");
              for (const raw of lines) {
                const line = raw.trim();
                if (!line) continue;
                try {
                  const evt = JSON.parse(line) as any;
                  if (evt?.type === "delta" && typeof evt?.content === "string") {
                    acc += evt.content;
                    onToken?.(evt.content);
                    onChunk(acc);
                  } else {
                    // Si no es evento NDJSON, asumimos texto plano incremental
                    acc += line + "\n";
                    onChunk(acc);
                  }
                } catch {
                  acc += raw;
                  onChunk(acc);
                }
              }
            }
          }
          if (xhr.readyState === 4) {
            try {
              signal?.removeEventListener?.("abort", abort);
            } catch {}
            resolve(acc.trim());
          }
        } catch (e) {
          reject(toErr("UnknownError", "XHR parse error", { cause: e }));
        }
      };
  
      xhr.onerror = () => {
        try {
          signal?.removeEventListener?.("abort", abort);
        } catch {}
        reject(toErr("NetworkError", "XHR network error"));
      };
      xhr.ontimeout = () => {
        try {
          signal?.removeEventListener?.("abort", abort);
        } catch {}
        reject(toErr("TimeoutError", "XHR timeout"));
      };
  
      try {
        xhr.send(JSON.stringify(payload));
      } catch (e) {
        reject(toErr("UnknownError", "XHR send failed", { cause: e }));
      }
    });
  }
  
  /* -------------------------- Construcción de payload ----------------------- */
  
  function finalizeRequest(provider: Provider, req: ChatRequest): Required<ChatRequest> {
    // Normaliza provider y modelo
    provider = normalizeProvider(provider);
    const model = resolveModel(provider, req.model);
  
    // Asegurar style y query para cumplir Required<ChatRequest>
    const style: ChatStyle = (req.style ?? ({} as ChatStyle));
    const query: string = req.query ?? "";
  
    // Si no trae messages, generarlos desde query; si tampoco hay query, usar []
    const messages: ChatMessagePayload[] =
      req.messages ?? (query ? toMessagesFromQuery(query, style) : ([] as ChatMessagePayload[]));
  
    // Clamping + default seguro para max_tokens
    const max_tokens: number = clampOutputTokens(provider, model, req.max_tokens) ?? 512;
  
    return {
      query,
      messages,
      style,
      model,
      temperature: req.temperature ?? 0.2,
      top_p: req.top_p ?? 0.95,
      max_tokens,
      meta: req.meta ?? {},
    };
  }
  
  /* --------------------------------- API ------------------------------------ */
  
  /**
   * Streaming universal desde /proxy/:provider/stream
   * Acepta NDJSON con eventos { type: "delta", content: "..." }
   */
  export async function proxyStream(
    provider: Provider,
    req: ChatRequest,
    onUpdate: UpdateFn,
    options: StreamOptions = {}
  ): Promise<string> {
    const requestId = `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const { signal, onStart, onToken, onComplete, onError, rafThrottle } = options;
  
    provider = normalizeProvider(provider);
    const finalReq = finalizeRequest(provider, req);
    const url = `${API_BASE}/proxy/${provider}/stream`;
  
    const throttledUpdate = rafThrottleWrap(onUpdate, rafThrottle);
  
    onStart?.({ provider, model: finalReq.model, requestId });
  
    // 1) Fetch streaming (NDJSON + tolerante a texto plano)
    if (supportsFetchStreaming()) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "text/plain, application/x-ndjson" },
          body: JSON.stringify(finalReq),
          signal,
        });
        if (!res.ok) {
          const text = await (async () => {
            try {
              return await res.text();
            } catch {
              return "";
            }
          })();
          throw toErr("HTTPError", `HTTP ${res.status}`, { status: res.status, cause: text });
        }
        if (!res.body) throw toErr("UnknownError", "No stream body");
  
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        let buf = "";
        let mode: "ndjson" | "text" | null = null;
  
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
  
          if (mode === "text") {
            acc += chunk;
            (throttledUpdate || onUpdate)(acc);
            continue;
          }
  
          buf += chunk;
  
          if (mode === null) {
            const probe = buf.trimStart();
            if (probe.startsWith("{") && probe.includes('"type"')) mode = "ndjson";
            else if (probe.length > 0) mode = "text";
          }
  
          if (mode === "text") {
            acc += buf;
            buf = "";
            (throttledUpdate || onUpdate)(acc);
            continue;
          }
  
          let idx: number;
          while ((idx = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const evt = JSON.parse(line) as any;
              if (evt?.type === "delta" && typeof evt?.content === "string") {
                acc += evt.content;
                onToken?.(evt.content);
                (throttledUpdate || onUpdate)(acc);
              }
            } catch {
              mode = "text";
              acc += line + "\n";
              (throttledUpdate || onUpdate)(acc);
            }
          }
        }
  
        if (mode === "ndjson" && buf.trim()) {
          try {
            const evt = JSON.parse(buf.trim()) as any;
            if (evt?.type === "delta" && typeof evt?.content === "string") {
              acc += evt.content;
              onToken?.(evt.content);
              (throttledUpdate || onUpdate)(acc);
            }
          } catch {
            acc += buf;
            (throttledUpdate || onUpdate)(acc);
          }
        }
  
        onComplete?.(acc.trim());
        return acc.trim();
      } catch (e: any) {
        if (signal && (signal as any).aborted) {
          const err = toErr("AbortError", "Aborted by caller");
          onError?.(err);
          throw err;
        }
        // Continuar a XHR
      }
    }
  
    // 2) XHR chunked (iOS/Safari friendly)
    try {
      const acc = await streamXHR(url, finalReq, (text) => (throttledUpdate || onUpdate)(text), signal, onToken);
      onComplete?.(acc);
      return acc;
    } catch (e: any) {
      if (signal && (signal as any).aborted) {
        const err = toErr("AbortError", "Aborted by caller");
        onError?.(err);
        throw err;
      }
      // 3) Fallback no streaming
      const acc = await proxyComplete(provider, finalReq, options);
      (throttledUpdate || onUpdate)(acc);
      onComplete?.(acc);
      return acc;
    }
  }
  
  /**
   * Fallback no-stream a /proxy/:provider/complete
   */
  export async function proxyComplete(
    provider: Provider,
    req: ChatRequest,
    options: StreamOptions = {}
  ): Promise<string> {
    provider = normalizeProvider(provider);
    const finalReq = finalizeRequest(provider, req);
    const url = `${API_BASE}/proxy/${provider}/complete`;
    const { signal, timeoutMs = 15000, retry = 2, onError } = options;
  
    type CompleteResp = { text?: string; content?: string; output?: string };
    try {
      const data = await postJSON<CompleteResp>(url, finalReq, { signal, timeoutMs, retry });
      return (data.text || data.content || data.output || "").trim();
    } catch (e: any) {
      const err: LLMError =
        e?.name === "HTTPError"
          ? e
          : e?.name === "AbortError"
          ? e
          : toErr("UnknownError", e?.message || "Unknown error", { cause: e });
      onError?.(err);
      throw err;
    }
  }
  
  /**
   * Helper de alto nivel: usa streaming si pasas onUpdate; si no, /complete.
   */
  export async function generateWithLLM(
    provider: Provider,
    req: ChatRequest,
    onUpdate?: UpdateFn,
    options?: StreamOptions
  ): Promise<string> {
    if (onUpdate) return proxyStream(provider, req, onUpdate, options);
    return proxyComplete(provider, req, options);
  }
  
