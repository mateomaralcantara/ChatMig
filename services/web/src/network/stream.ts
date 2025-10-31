const API =
  `${String(import.meta.env.VITE_API_BASE).replace(/\/+$/,'')}${String(import.meta.env.VITE_API_STREAM_PATH)}`;

type Msg = { role:'user'|'assistant'|'system'; content:string };
type StreamPayload = {
  provider: 'google'|'openai'|'anthropic'|'mistral';
  model: string;
  userText?: string;
  messages?: Msg[];
  headers?: Record<string,string>;
  signal?: AbortSignal;
};

export async function postStream(
  { provider, model, userText, messages, headers, signal }: StreamPayload,
  onDelta: (chunk: string) => void
): Promise<string> {
  const body = userText
    ? { provider, model, query: userText }
    : { provider, model, messages: messages ?? [] };

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson', ...(headers||{}) },
    body: JSON.stringify(body),
    signal
  });
  if (!res.ok || !res.body) throw new Error(await res.text());

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });

    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const raw = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!raw) continue;

      // Soporta NDJSON puro o "data: {...}"
      const line = raw.startsWith('data:') ? raw.slice(5).trim() : raw;
      try {
        const evt = JSON.parse(line);
        if (evt.type === 'delta' && evt.content) {
          onDelta(evt.content);
          full += evt.content;
        } else if (evt.type === 'done') {
          return full;
        }
      } catch { /* ignora líneas no-JSON */ }
    }

    // Seguridad: evita buffers gigantes si el server no manda \n
    if (buf.length > 1_000_000) { buf = ''; }
  }
  return full;
}

