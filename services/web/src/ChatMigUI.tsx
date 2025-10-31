/// <reference types="vite/client" />

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { voiceAgent } from "./lib/voice-agent";
import agentImg from "./assets/agent.png"; // 👈 NEW: avatar del agente (recomendado en src/assets)

// URL del avatar (si algún día migras a public/, usa: const AGENT_AVATAR_URL = "/agent.png")
const AGENT_AVATAR_URL = agentImg;

/* ========================================================================
   Tipos & utilidades
   ===================================================================== */

type Role = "user" | "assistant";
interface ChatMessage { id: string; role: Role; content: string; time: number }
type StyleFormat = "sections" | "bullets" | "paragraphs";
type ProviderId = "openai" | "anthropic" | "google" | "mistral" | "cohere" | "bedrock-meta";

type PlanId = "free" | "pro" | "premium";

interface PlanResponse {
  summary?: string;
  steps?: string[];
  script?: string;
  ab?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  metric_of_the_day?: string;
  task?: string;
  p_success?: number;
  drivers?: string[];
}

interface HistoryItem { id: string; text: string; time: number }

interface ChatSession {
  id: string;
  title: string;
  created: number;
  updated: number;
}

interface AgentOpt {
  id: string;
  name: string;
  desc: string;
  guideline: string;
}

/* ========================================================================
   Constantes / Config
   ===================================================================== */

const hasWindow = typeof window !== "undefined";
const hasSpeechSynthesis = hasWindow && "speechSynthesis" in window;
const hasSpeechRec =
  hasWindow &&
  (("SpeechRecognition" in (window as any)) ||
    ("webkitSpeechRecognition" in (window as any)));

const MAX_HISTORY = 300;
const MAX_SESSIONS = 80;
const MAX_WORDS_HARD = 4000;
const MIN_WORDS_HARD = 100;

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE) ??
  "http://127.0.0.1:8000";

const API_STREAM_PATH =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_STREAM_PATH) ?? "/chat/complete_stream";

const DEFAULT_WORDS = Math.min(
  Math.max(
    Number(
      (typeof import.meta !== "undefined" &&
        (import.meta as any).env?.VITE_LLM_MAX_WORDS) ?? 1200
    ),
    MIN_WORDS_HARD
  ),
  MAX_WORDS_HARD
);

// Agentes (perfiles funcionales)
const AGENTS: AgentOpt[] = [
  {
    id: "asesor",
    name: "Asesor Migratorio (default)",
    desc: "Requisitos, tiempos, costos y pasos.",
    guideline:
      "Eres un asesor migratorio. Da pasos claros, documentos requeridos, costos/tasas aproximadas, tiempos consulares y enlaces a próximos hitos.",
  },
  {
    id: "traductor",
    name: "Traductor Legal",
    desc: "Traduce con precisión y glosario.",
    guideline:
      "Eres un traductor jurídico. Devuelve traducción precisa, mantiene formato, resalta términos clave y añade glosario breve al final.",
  },
  {
    id: "formularios",
    name: "Redactor de Formularios",
    desc: "Guía campo por campo (DS-160, etc.).",
    guideline:
      "Eres un asistente de formularios. Guía paso a paso campo por campo, valida consistencia y advierte errores comunes.",
  },
  {
    id: "entrevista",
    name: "Simulador de Entrevista",
    desc: "Role-play con feedback inmediato.",
    guideline:
      "Eres un entrevistador consular. Haz preguntas de manera realista y da feedback objetivo y accionable al finalizar cada respuesta.",
  },
];

// Modelos por proveedor (ajusta a tu catálogo real)
const MODELS: Record<ProviderId, { id: string; label: string }[]> = {
  openai: [
    { id: "gpt-4o-mini", label: "GPT-4o mini" },
    { id: "gpt-4o", label: "GPT-4o" },
    { id: "o4-mini", label: "o4-mini (preview)" },
    { id: "gpt-4.1", label: "GPT-4.1" },
  ],
  anthropic: [
    { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
    { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    { id: "claude-3-haiku-latest", label: "Claude 3 Haiku" },
  ],
  google: [
    { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large" },
    { id: "mistral-small-latest", label: "Mistral Small" },
  ],
  cohere: [
    { id: "command-r-plus", label: "Command R+" },
    { id: "command-r", label: "Command R" },
  ],
  "bedrock-meta": [
    { id: "meta.llama3-1-70b-instruct-v1:0", label: "Llama 3.1 70B Instruct" },
    { id: "meta.llama3-1-8b-instruct-v1:0", label: "Llama 3.1 8B Instruct" },
  ],
};

// Defaults de UI (persistentes)
const LLM_PROVIDER_KEY = "chatmig.llm.provider";
const LLM_MODEL_KEY    = "chatmig.llm.model";
const LLM_AGENT_KEY    = "chatmig.llm.agent";

// Claves antiguas (para migración)
const LEGACY_STORAGE_KEY = "chatmig.messages.v1";

// Storage keys (namespaces por usuario y sesión)
const USER_ID_KEY       = "chatmig.user.id";
const HISTORY_NS        = "chatmig.history.v1";
const SESSIONS_NS       = "chatmig.sessions.v1";
const ACTIVE_SESSION_NS = "chatmig.activeSessionId.v1";
const MSGS_NS           = "chatmig.messages.v2";

const TTS_ENABLED_KEY   = "chatmig.tts.enabled";
const TTS_CLEANREAD_KEY = "chatmig.tts.cleanread";

// RIGHT PANEL (login/membresías)
const RIGHT_PANEL_OPEN_KEY = "chatmig.ui.rightpanel"; // "1" | "0"
const AUTH_TAB_KEY = "chatmig.auth.tab"; // "login" | "signup"
const PLAN_SEL_KEY = "chatmig.plan.selected"; // PlanId

/* ========================================================================
   Helpers básicos
   ===================================================================== */

const uid = () =>
  (typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2));

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const nowTs = () => Date.now();

const autoTitleFrom = (s: string) => {
  const line = (s || "").split("\n").find(Boolean) || "Nueva conversación";
  const clean = line.replace(/\s+/g, " ").trim();
  return clean.length > 48 ? clean.slice(0, 47) + "…" : clean || "Nueva conversación";
};

const safeJSONParse = <T,>(raw: string | null, fallback: T): T => {
  try {
    if (!raw) return fallback;
    const val = JSON.parse(raw);
    return (val ?? fallback) as T;
  } catch {
    return fallback;
  }
};

/* ========================================================================
   Audio/TTS helpers
   ===================================================================== */

type AnyAudioContext = any;
const getAudioContext = (): AnyAudioContext | null => {
  if (!hasWindow) return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  return AC ? new AC() : null;
};

function pickVoiceFor(lang: string) {
  const s = hasSpeechSynthesis ? window.speechSynthesis : null;
  const voices = s?.getVoices?.() ?? [];
  if (!voices.length) return null;
  const L = (lang || "es-ES").toLowerCase();
  return (
    voices.find((v) => v.lang?.toLowerCase().startsWith(L)) ||
    voices.find((v) => v.lang?.toLowerCase().startsWith(L.split("-")[0])) ||
    voices.find((v) => /es|spanish/i.test(`${v.lang} ${v.name}`)) ||
    voices[0]
  );
}

const waitVoices = (): Promise<void> =>
  new Promise((resolve) => {
    if (!hasSpeechSynthesis) return resolve();
    const s = window.speechSynthesis;
    if (s.getVoices().length) return resolve();
    const on = () => { resolve(); s.removeEventListener?.("voiceschanged", on); };
    s.addEventListener?.("voiceschanged", on);
    setTimeout(on, 2500);
  });

async function unlockAudioAndTTS(ctxRef: React.MutableRefObject<AnyAudioContext | null>) {
  try {
    if (!ctxRef.current) ctxRef.current = getAudioContext();
    await ctxRef.current?.resume?.();
  } catch {}
  if (hasSpeechSynthesis) {
    const s = window.speechSynthesis;
    try {
      s.cancel(); s.resume();
      setTimeout(() => s.resume(), 0);
      setTimeout(() => s.resume(), 60);
      setTimeout(() => s.resume(), 140);
    } catch {}
  }
}

/* ========================================================================
   Compat helpers
   ===================================================================== */

function runTransition(fn: () => void) {
  try {
    // @ts-ignore
    const st = (React as any).startTransition;
    if (typeof st === "function") return st(fn);
  } catch {}
  return fn();
}

function supportsFetchStreaming() {
  try {
    return (
      typeof ReadableStream !== "undefined" &&
      typeof Response !== "undefined" &&
      typeof (Response.prototype as any).body !== "undefined"
    );
  } catch { return false; }
}

/* ========================================================================
   fetch/stream universales con timeout/retry
   ===================================================================== */

async function postJSON<T>(
  url: string,
  body: unknown,
  opts: { signal?: AbortSignal; timeoutMs?: number; retry?: number } = {}
): Promise<T> {
  const { signal, timeoutMs = 15000, retry = 1 } = opts;

  for (let attempt = 0; attempt <= retry; attempt++) {
    const AC = (typeof AbortController !== "undefined") ? AbortController : null;
    const ctrl = AC ? new AC() : null;

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { ctrl?.abort(); } catch {}
    }, timeoutMs);

    const externalAbort = () => { try { ctrl?.abort(); } catch {} };
    try { signal?.addEventListener?.("abort", externalAbort, { once: true }); } catch {}

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: (ctrl?.signal || signal) as any,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      clearTimeout(timer);
      try { signal?.removeEventListener?.("abort", externalAbort); } catch {}
      return data;
    } catch (err) {
      clearTimeout(timer);
      try { signal?.removeEventListener?.("abort", externalAbort); } catch {}
      if (attempt < retry && !(signal as any)?.aborted && !timedOut) continue;
      throw err as Error;
    }
  }
  throw new Error("Unexpected");
}

function streamXHR(
  url: string,
  payload: unknown,
  onChunk: (acc: string) => void,
  signal?: AbortSignal
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let acc = "";

    xhr.open("POST", url, true);
    try { xhr.responseType = "text"; } catch {}
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("Accept", "text/plain, application/x-ndjson");

    const abort = () => { try { xhr.abort(); } catch {}; reject(new Error("Aborted")); };
    signal?.addEventListener?.("abort", abort, { once: true });

    xhr.onreadystatechange = () => {
      try {
        if (xhr.readyState === 3 || xhr.readyState === 4) {
          const text = xhr.responseText || "";
          if (text.length > acc.length) {
            acc = text;
            onChunk(acc);
          }
        }
        if (xhr.readyState === 4) {
          try { signal?.removeEventListener?.("abort", abort); } catch {}
          resolve(acc.trim());
        }
      } catch (e) { reject(e as any); }
    };

    xhr.onerror = () => { try { signal?.removeEventListener?.("abort", abort); } catch {}; reject(new Error("Network error")); };
    xhr.ontimeout = () => { try { signal?.removeEventListener?.("abort", abort); } catch {}; reject(new Error("Timeout")); };

    try { xhr.send(JSON.stringify(payload)); } catch (e) { reject(e as any); }
  });
}

async function streamToAcc(
  streamUrl: string,
  fallbackUrl: string,
  payload: unknown,
  update: (acc: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (supportsFetchStreaming()) {
    try {
      const res = await fetch(streamUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/plain, application/x-ndjson" },
        body: JSON.stringify(payload),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No stream body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let buf = "";
      let mode: "ndjson" | "text" | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        if (mode === "text") { acc += chunk; update(acc); continue; }

        buf += chunk;
        if (mode === null) {
          const probe = buf.trimStart();
          if (probe.startsWith("{") && probe.includes('"type"')) mode = "ndjson";
          else if (probe.length > 0) mode = "text";
        }
        if (mode === "text") { acc += buf; buf = ""; update(acc); continue; }

        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const raw = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!raw) continue;
          const line = raw.startsWith("data:") ? raw.slice(5).trim() : raw;
          try {
            const evt = JSON.parse(line);
            if (evt.type === "delta" && typeof evt.content === "string") {
              acc += evt.content; update(acc);
            }
            if (evt.type === "done") return acc.trim();
          } catch {
            mode = "text"; acc += raw + "\n"; update(acc);
          }
        }
      }

      if (mode === "ndjson" && buf.trim()) {
        try {
          const evt = JSON.parse(buf.trim());
          if (evt.type === "delta" && typeof evt.content === "string") {
            acc += evt.content; update(acc);
          }
        } catch { acc += buf; update(acc); }
      }
      return (acc || "").trim();
    } catch {}
  }

  try {
    return await streamXHR(streamUrl, payload, update, signal);
  } catch {
    const data = await postJSON<{ text?: string; content?: string }>(
      fallbackUrl,
      payload,
      { signal }
    );
    const out = (data && (data.text || (data as any).content)) || "";
    update(out);
    return out;
  }
}

/* ========================================================================
   TTS: sanitizado + chunking
   ===================================================================== */

function ttsSanitize(raw: string): string {
  let s = (raw || "").normalize("NFC");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/`[^`]+`/g, " ");
  s = s.replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/gi, "$1");
  s = s.replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, " ");
  s = s.replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, " ");
  s = s.replace(/^\s*#{1,6}\s*/gm, "");
  s = s.replace(/^\s*[*\-–—•·]\s+/gm, "");
  s = s.replace(/^\s*\d+[\.\)]\s+/gm, "");
  s = s.replace(/(\*{1,3}|_{1,3})([^*_]+)\1/g, "$2");
  s = s.replace(/^\s*>\s?/gm, "");
  s = s.replace(/[\\*_#>\[\]\{\}\(\)~`^=+|]+/g, " ");
  s = s.replace(/\s*[•·]\s*/g, ", ");
  s = s.replace(/[\u2013\u2014-]{2,}/g, ", ");
  s = s.replace(/\s*\n+\s*/g, ". ");
  s = s.replace(/([,.!?;:])\1+/g, "$1");
  s = s.replace(/([,.!?;:])(?=\S)/g, "$1 ");
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/(?:^| )[\.*]+( |$)/g, " ");
  s = s.trim();
  return s;
}

function splitIntoTTSChunks(text: string, maxLen = 240): string[] {
  const out: string[] = [];
  const sentences = text.match(/[^.?!…]+[.?!…]?/g) || [text];
  let current = "";

  for (const part of sentences) {
    const piece = part.trim();
    if (!piece) continue;
    if ((current + " " + piece).trim().length <= maxLen) {
      current = (current ? current + " " : "") + piece;
    } else {
      if (current) out.push(current.trim());
      if (piece.length <= maxLen) {
        out.push(piece);
        current = "";
      } else {
        const words = piece.split(/\s+/);
        let buf = "";
        for (const w of words) {
          if ((buf + " " + w).trim().length > maxLen) {
            if (buf) out.push(buf.trim());
            buf = w;
          } else {
            buf = (buf ? buf + " " : "") + w;
          }
        }
        if (buf) out.push(buf.trim());
        current = "";
      }
    }
  }
  if (current) out.push(current.trim());
  return out;
}

/* ========================================================================
   Throttler (raf + transition)
   ===================================================================== */

function createRafThrottler<T>(fn: (v: T) => void) {
  let queued = false;
  let last: T;
  return (v: T) => {
    last = v;
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      runTransition(() => fn(last));
    });
  };
}

/* ========================================================================
   Usuario / historial / sesiones
   ===================================================================== */

function getUserId(): string {
  try {
    const saved = hasWindow ? localStorage.getItem(USER_ID_KEY) : null;
    if (saved) return saved;
  } catch {}
  const id = "U-" + uid().slice(0, 8);
  try { hasWindow && localStorage.setItem(USER_ID_KEY, id); } catch {}
  return id;
}

const histKeyFor   = (userId: string) => `${HISTORY_NS}:${userId}`;
const sessKeyFor   = (userId: string) => `${SESSIONS_NS}:${userId}`;
const activeKeyFor = (userId: string) => `${ACTIVE_SESSION_NS}:${userId}`;
const msgsKeyFor   = (userId: string, sessionId: string) => `${MSGS_NS}:${userId}:${sessionId}`;

function loadHistory(userId: string): HistoryItem[] {
  if (!hasWindow) return [];
  try {
    const raw = localStorage.getItem(histKeyFor(userId));
    const arr = safeJSONParse<HistoryItem[]>(raw, []);
    return Array.isArray(arr) ? arr.slice(0, MAX_HISTORY) : [];
  } catch { return []; }
}

function saveHistory(userId: string, items: HistoryItem[]) {
  if (!hasWindow) return;
  try {
    localStorage.setItem(histKeyFor(userId), JSON.stringify(items.slice(0, MAX_HISTORY)));
  } catch {}
}

function recordHistory(userId: string, text: string, prev: HistoryItem[]): HistoryItem[] {
  const t = nowTs();
  const trimmed = text.trim();
  if (!trimmed) return prev;
  const last = prev[0];
  if (last && last.text === trimmed) {
    const updated = [{ ...last, time: t }, ...prev.slice(1)];
    saveHistory(userId, updated);
    return updated;
  }
  const item: HistoryItem = { id: uid(), text: trimmed, time: t };
  const deduped = [item, ...prev.filter((i) => i.text !== trimmed)];
  const limited = deduped.slice(0, MAX_HISTORY);
  saveHistory(userId, limited);
  return limited;
}

// Sesiones
function loadSessions(userId: string): ChatSession[] {
  if (!hasWindow) return [];
  try {
    const raw = localStorage.getItem(sessKeyFor(userId));
    const arr = safeJSONParse<ChatSession[]>(raw, []);
    return Array.isArray(arr) ? arr.slice(0, MAX_SESSIONS) : [];
  } catch { return []; }
}
function saveSessions(userId: string, sessions: ChatSession[]) {
  if (!hasWindow) return;
  try { localStorage.setItem(sessKeyFor(userId), JSON.stringify(sessions.slice(0, MAX_SESSIONS))); } catch {}
}
function loadActiveSessionId(userId: string): string | null {
  if (!hasWindow) return null;
  try { return localStorage.getItem(activeKeyFor(userId)); } catch { return null; }
}
function setActiveSessionId(userId: string, sessionId: string) {
  if (!hasWindow) return;
  try { localStorage.setItem(activeKeyFor(userId), sessionId); } catch {}
}

function loadMessages(userId: string, sessionId: string): ChatMessage[] {
  if (!hasWindow) return [greetingMsg()];
  try {
    const raw = localStorage.getItem(msgsKeyFor(userId, sessionId));
    const arr = safeJSONParse<ChatMessage[]>(raw, []);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch {}
  return [greetingMsg()];
}
function saveMessages(userId: string, sessionId: string, msgs: ChatMessage[]) {
  if (!hasWindow) return;
  try { localStorage.setItem(msgsKeyFor(userId, sessionId), JSON.stringify(msgs)); } catch {}
}
const greetingMsg = (): ChatMessage => ({
  id: uid(),
  role: "assistant",
  content:
    "¡Bienvenid@ a **ChatMig**! Contame tu caso (país, tipo de visa, fechas) y te doy **requisitos**, **costos**, **tiempos** y **siguientes pasos**.\nTip: elegí *Agente*, *Proveedor* y *Modelo* desde el menú superior.",
  time: nowTs(),
});

// Migración desde STORAGE_KEY antiguo (una sola vez)
function migrateLegacyIfNeeded(userId: string, sessions: ChatSession[]) {
  try {
    if (sessions.length > 0) return sessions;
    const legacyRaw = hasWindow ? localStorage.getItem(LEGACY_STORAGE_KEY) : null;
    if (!legacyRaw) {
      const s: ChatSession = { id: uid(), title: "Conversación 1", created: nowTs(), updated: nowTs() };
      saveSessions(userId, [s]);
      saveMessages(userId, s.id, [greetingMsg()]);
      return [s];
    }
    const legacy = safeJSONParse<ChatMessage[]>(legacyRaw, []);
    const s: ChatSession = { id: uid(), title: "Conversación 1", created: nowTs(), updated: nowTs() };
    saveSessions(userId, [s]);
    saveMessages(userId, s.id, Array.isArray(legacy) && legacy.length ? legacy : [greetingMsg()]);
    hasWindow && localStorage.removeItem(LEGACY_STORAGE_KEY);
    return [s];
  } catch {
    const s: ChatSession = { id: uid(), title: "Conversación 1", created: nowTs(), updated: nowTs() };
    saveSessions(userId, [s]);
    saveMessages(userId, s.id, [greetingMsg()]);
    return [s];
  }
}

/* ========================================================================
   Componente principal
   ===================================================================== */

export default function ChatMig() {
  const userId = useMemo(() => getUserId(), []);

  // ==== Sesiones (carga + migración + sesión activa) ====
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const list = loadSessions(userId);
    return migrateLegacyIfNeeded(userId, list);
  });

  const [sessionId, setSessionId] = useState<string>(() => {
    const saved = loadActiveSessionId(userId);
    if (saved && sessions.find(s => s.id === saved)) return saved;
    const first = sessions[0]?.id ?? (() => {
      const s: ChatSession = { id: uid(), title: "Conversación 1", created: nowTs(), updated: nowTs() };
      saveSessions(userId, [s]);
      return s.id;
    })();
    setActiveSessionId(userId, first);
    return first;
  });

  // Historial global del usuario (no por sesión)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory(userId));
  const [histQuery, setHistQuery] = useState("");

  // Mensajes de la sesión activa
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadMessages(userId, sessionId));

  // Estilo (mantengo snapshot por si tu backend lo usa)
  const [tone] = useState("claro, empático y directo");
  const [format] = useState<StyleFormat>("sections");
  const [useEmojis] = useState(true);
  const [lengthWords] = useState(DEFAULT_WORDS);
  const [audience] = useState("principiante");
  const [language, setLanguage] = useState("es");

  // Agente (persistido)
  const [agentId, setAgentId] = useState<string>(() => {
    try { return localStorage.getItem(LLM_AGENT_KEY) || AGENTS[0].id; } catch { return AGENTS[0].id; }
  });

  // Proveedor + modelo (persistidos)
  const [provider, setProvider] = useState<ProviderId>(() => {
    try {
      const p = (localStorage.getItem(LLM_PROVIDER_KEY) || "openai") as ProviderId;
      return (Object.keys(MODELS) as ProviderId[]).includes(p) ? p : "openai";
    } catch { return "openai"; }
  });
  const [model, setModel] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LLM_MODEL_KEY);
      const list = MODELS["openai"];
      return saved && list.some(m => m.id === saved) ? saved : list[0].id;
    } catch { return MODELS["openai"][0].id; }
  });

  // Voz (persistencia de toggles)
  const [speakEnabled, setSpeakEnabled] = useState<boolean>(() => {
    try {
      const raw = hasWindow ? localStorage.getItem(TTS_ENABLED_KEY) : null;
      return raw === null ? true : raw === "1";
    } catch { return true; }
  });
  const [sanitizeRead, setSanitizeRead] = useState<boolean>(() => {
    try {
      const raw = hasWindow ? localStorage.getItem(TTS_CLEANREAD_KEY) : null;
      return raw === null ? true : raw === "1";
    } catch { return true; }
  });
  const [dictating, setDictating] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [voicesReady, setVoicesReady] = useState(
    hasSpeechSynthesis && !!window.speechSynthesis.getVoices().length
  );

  // Estados de runtime
  const [isTyping, setIsTyping] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // === Right Panel (Login/Membresías) ===
  const [rightOpen, setRightOpen] = useState<boolean>(() => {
    try { return localStorage.getItem(RIGHT_PANEL_OPEN_KEY) === "1"; } catch { return false; }
  });
  const [authTab, setAuthTab] = useState<"login" | "signup">(() => {
    try { return (localStorage.getItem(AUTH_TAB_KEY) as any) === "signup" ? "signup" : "login"; } catch { return "login"; }
  });
  const [plan, setPlan] = useState<PlanId>(() => {
    try { return (localStorage.getItem(PLAN_SEL_KEY) as PlanId) || "free"; } catch { return "free"; }
  });

  // Refs
  const audioCtxRef = useRef<AnyAudioContext | null>(null);
  const liveUtterancesRef = useRef<Set<SpeechSynthesisUtterance>>(new Set());
  const ttsSessionRef = useRef<{ token: number; cancelled: boolean } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mounted.current = true;
    const onBeforeUnload = () => { try { inFlight.current?.abort(); } catch {} };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      mounted.current = false;
      try { inFlight.current?.abort(); } catch {}
      if (hasSpeechSynthesis) {
        try {
          if (ttsSessionRef.current) ttsSessionRef.current.cancelled = true;
          window.speechSynthesis.cancel();
        } catch {}
      }
      try { audioCtxRef.current?.close?.(); } catch {}
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  // Voces
  useEffect(() => {
    if (!hasSpeechSynthesis) return;
    const s = window.speechSynthesis;
    const onVoices = () => setVoicesReady(true);
    s.addEventListener?.("voiceschanged", onVoices);
    try { s.getVoices(); } catch {}
    if (s.getVoices().length) setVoicesReady(true);
    return () => s.removeEventListener?.("voiceschanged", onVoices);
  }, []);

  // Desbloqueo por primer gesto
  useEffect(() => {
    const onGesture = async () => {
      await unlockAudioAndTTS(audioCtxRef);
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchend", onGesture);
      window.removeEventListener("click", onGesture);
      window.removeEventListener("keydown", onGesture);
      if (hasSpeechSynthesis) {
        try {
          const s = window.speechSynthesis;
          const u = new SpeechSynthesisUtterance("ok");
          u.volume = 0;
          s.speak(u);
          setTimeout(() => s.cancel(), 120);
        } catch {}
      }
    };
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("touchend", onGesture, { once: true });
    window.addEventListener("click", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchend", onGesture);
      window.removeEventListener("click", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, []);

  // Snapshot de estilo
  const styleRef = useRef({ tone, useEmojis, lengthWords, format, audience, language });
  useEffect(() => {
    styleRef.current = { tone, useEmojis, lengthWords, format, audience, language };
  }, [tone, useEmojis, lengthWords, format, audience, language]);

  // Persistencia de mensajes (por sesión)
  useEffect(() => {
    try { saveMessages(userId, sessionId, messages); } catch {}
  }, [messages, userId, sessionId]);

  // Persistencia toggles TTS
  useEffect(() => { try { hasWindow && localStorage.setItem(TTS_ENABLED_KEY, speakEnabled ? "1" : "0"); } catch {} }, [speakEnabled]);
  useEffect(() => { try { hasWindow && localStorage.setItem(TTS_CLEANREAD_KEY, sanitizeRead ? "1" : "0"); } catch {} }, [sanitizeRead]);

  // Persistencia provider/model/agent
  useEffect(() => { try { localStorage.setItem(LLM_PROVIDER_KEY, provider); } catch {} }, [provider]);
  useEffect(() => { try { localStorage.setItem(LLM_MODEL_KEY, model); } catch {} }, [model]);
  useEffect(() => { try { localStorage.setItem(LLM_AGENT_KEY, agentId); } catch {} }, [agentId]);

  // Persistencia right panel
  useEffect(() => { try { localStorage.setItem(RIGHT_PANEL_OPEN_KEY, rightOpen ? "1" : "0"); } catch {} }, [rightOpen]);
  useEffect(() => { try { localStorage.setItem(AUTH_TAB_KEY, authTab); } catch {} }, [authTab]);
  useEffect(() => { try { localStorage.setItem(PLAN_SEL_KEY, plan); } catch {} }, [plan]);

  // Sincronización cross-tab
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key === histKeyFor(userId)) {
        setHistory(loadHistory(userId));
      } else if (e.key === sessKeyFor(userId)) {
        setSessions(loadSessions(userId));
      } else if (e.key === activeKeyFor(userId)) {
        const newId = loadActiveSessionId(userId);
        if (newId && newId !== sessionId) {
          try { inFlight.current?.abort(); } catch {}
          setSessionId(newId);
          setMessages(loadMessages(userId, newId));
        }
      } else if (e.key === msgsKeyFor(userId, sessionId)) {
        setMessages(loadMessages(userId, sessionId));
      } else if (e.key === TTS_ENABLED_KEY) {
        setSpeakEnabled(e.newValue === "1");
      } else if (e.key === TTS_CLEANREAD_KEY) {
        setSanitizeRead(e.newValue === "1");
      } else if (e.key === LLM_PROVIDER_KEY) {
        const p = (localStorage.getItem(LLM_PROVIDER_KEY) || provider) as ProviderId;
        if (p !== provider) setProvider(p);
      } else if (e.key === LLM_MODEL_KEY) {
        const m = localStorage.getItem(LLM_MODEL_KEY) || model;
        if (m !== model) setModel(m);
      } else if (e.key === LLM_AGENT_KEY) {
        const a = localStorage.getItem(LLM_AGENT_KEY) || agentId;
        if (a !== agentId) setAgentId(a);
      } else if (e.key === RIGHT_PANEL_OPEN_KEY) {
        setRightOpen(e.newValue === "1");
      } else if (e.key === AUTH_TAB_KEY) {
        setAuthTab((e.newValue as any) === "signup" ? "signup" : "login");
      } else if (e.key === PLAN_SEL_KEY) {
        setPlan(((e.newValue as PlanId) || "free"));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, sessionId, provider, model, agentId]);

  // Cambio de sesión → cargar mensajes
  useEffect(() => {
    setMessages(loadMessages(userId, sessionId));
    setActiveSessionId(userId, sessionId);
  }, [sessionId, userId]);

  // Auto-scroll
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isTyping]);

  // Auto-grow textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.height = "0px";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    });
  }, [messages, isTyping]);

  /* ======================================================================
     TTS: sesión exclusiva + stop duro (con voiceAgent overlay)
     ==================================================================== */
  const speakStrong = useCallback(async (msgId: string, rawText: string) => {
    if (!hasSpeechSynthesis || !rawText?.trim()) return;
    const s = window.speechSynthesis;

    try { s.cancel(); } catch {}
    for (const u of Array.from(liveUtterancesRef.current)) {
      try { (u as any).onend = null; (u as any).onerror = null; } catch {}
    }
    liveUtterancesRef.current.clear();

    await unlockAudioAndTTS(audioCtxRef);
    await waitVoices();

    const prefLang = styleRef.current.language || "es-ES";
    const voice = pickVoiceFor(prefLang);

    const safeText = sanitizeRead ? ttsSanitize(rawText) : (rawText || "");
    if (!safeText) return;

    const chunks = splitIntoTTSChunks(safeText, 240);
    if (!chunks.length) return;

    // ---- 1) Mostrar overlay y fijar idioma/título (+ avatar si lo soporta)
    try {
      (voiceAgent as any).show(safeText, {
        lang: prefLang,
        title: "Leyendo respuesta…",
        avatar: AGENT_AVATAR_URL, // 👈 NEW: pasamos avatar al overlay si está soportado
      });
    } catch {}

    const token = Date.now() + Math.random();
    ttsSessionRef.current = { token, cancelled: false };
    const isActive = () =>
      ttsSessionRef.current?.token === token && !ttsSessionRef.current?.cancelled;

    setSpeakingId(msgId);

    const speakIndex = (i: number) => {
      if (!isActive()) return;
      if (i >= chunks.length) {
        // ---- 3) Al finalizar
        try { voiceAgent.hide(); } catch {}
        setSpeakingId(null);
        if (isActive()) ttsSessionRef.current = null;
        return;
      }

      // ---- 2) Actualizar “karaoke” con cada chunk
      try { voiceAgent.update(chunks[i]); } catch {}

      let u: SpeechSynthesisUtterance | null = null;
      try {
        u = new SpeechSynthesisUtterance(chunks[i]);
        if (voice) (u as any).voice = voice;
        (u as any).lang = (voice as any)?.lang || prefLang;
        u.rate = 1; u.pitch = 1; u.volume = 1;

        u.onstart = () => { if (!isActive()) { try { s.cancel(); } catch {} } };
        u.onend = () => {
          if (u) liveUtterancesRef.current.delete(u);
          if (!isActive()) return;
          speakIndex(i + 1);
        };
        u.onerror = () => {
          if (u) liveUtterancesRef.current.delete(u);
          if (!isActive()) return;
          speakIndex(i + 1);
        };

        liveUtterancesRef.current.add(u);
        s.speak(u);

        setTimeout(() => {
          if (!isActive()) return;
          if (s.paused && s.speaking) { try { s.resume(); } catch {} }
        }, 120);
      } catch {
        if (u) liveUtterancesRef.current.delete(u);
        if (!isActive()) return;
        speakIndex(i + 1);
      }
    };

    speakIndex(0);
  }, [sanitizeRead]);

  const stopSpeak = useCallback(() => {
    if (!hasSpeechSynthesis) return;
    if (ttsSessionRef.current) {
      ttsSessionRef.current.cancelled = true;
      ttsSessionRef.current = null;
    }
    for (const u of Array.from(liveUtterancesRef.current)) {
      try { (u as any).onend = null; (u as any).onerror = null; } catch {}
    }
    liveUtterancesRef.current.clear();
    try {
      const s = window.speechSynthesis;
      s.pause?.();
      s.cancel();
      setTimeout(() => { try { s.cancel(); } catch {} }, 0);
    } finally {
      // Ocultar overlay si se detiene manualmente
      try { voiceAgent.hide(); } catch {}
      setSpeakingId(null);
    }
  }, []);

  // Dictado
  const startDictation = useCallback(async () => {
    if (!hasSpeechRec || dictating) return;
    try {
      await unlockAudioAndTTS(audioCtxRef);
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.lang = styleRef.current.language || "es-ES";
      rec.continuous = false;
      rec.interimResults = false;
      setDictating(true);
      rec.onresult = (e: any) => {
        const transcript = e?.results?.[0]?.[0]?.transcript as string | undefined;
        if (transcript) setInput((prev) => (prev ? prev + " " : "") + transcript);
      };
      rec.onend = () => setDictating(false);
      rec.onerror = () => setDictating(false);
      rec.start();
    } catch {}
  }, [dictating]);

  const stopStreaming = useCallback(() => {
    try { inFlight.current?.abort(); } catch {}
  }, []);

  // Construye payload con guideline (solo estilo; provider/model se agregan al enviar)
  const buildPayload = useCallback((userText: string) => {
    const agent = AGENTS.find(a => a.id === agentId) || AGENTS[0];
    const baseStyle = styleRef.current;
    const guideline =
      `${agent.guideline} ` +
      "Usa «» para destacar 1 cita útil cuando aplique. Evita relleno. " +
      "Si falta información crítica, pide datos mínimos.";
    return {
      query: userText,
      style: { ...baseStyle, agent: agent.id, guidelines: guideline },
    };
  }, [agentId]);

  // Llamada unificada (sin /proxy) + fallbacks
  const getAssistantReply = useCallback(
    async (userText: string, signal: AbortSignal): Promise<string> => {
      setErrorText(null);
      const payload = { provider, model, ...buildPayload(userText) };
      try {
        const finalText = await streamToAcc(
          `${API_BASE}${API_STREAM_PATH}`,
          `${API_BASE}/chat/complete`,
          payload,
          () => {},
          signal
        );
        if (finalText) return finalText;
      } catch (err: any) {
        if (!(signal as any)?.aborted) setErrorText(err?.message ?? "Error en stream");
      }

      // Fallback /chat/complete
      try {
        const data = await postJSON<{ text?: string; content?: string }>(
          `${API_BASE}/chat/complete`,
          payload,
          { signal, timeoutMs: 15000, retry: 1 }
        );
        const out = data.text || (data as any).content || "";
        if (out) return out;
      } catch {}

      // Fallback /chat/plan
      try {
        const data = await postJSON<PlanResponse>(
          `${API_BASE}/chat/plan`,
          { goal: userText, context: { channel: "chatmig" }, message_draft: userText },
          { signal, timeoutMs: 15000, retry: 1 }
        );
        const steps = Array.isArray(data.steps) ? data.steps : [];
        const plan = steps.length ? `Plan:\n${steps.map((s) => `• ${s}`).join("\n")}` : "";
        const script = data.script ? `\n\nGuía:\n${data.script}` : "";
        const meta =
          typeof data.p_success === "number"
            ? `\n\nProb. de éxito estimada: ${(data.p_success * 100).toFixed(0)}%`
            : "";
        const out = [plan, script, meta].filter(Boolean).join("").trim();
        return out || "Sin plan.";
      } catch (err: any) {
        if (!(signal as any)?.aborted) setErrorText(err?.message ?? "Error en /chat/plan");
        return `Plan rápido para: ${userText}
• Verifica elegibilidad y tipo de visa
• Prepara documentos base (pasaporte, foto, formulario)
• Estima costos y tiempos (consular/servicio)
• Agenda cita y define siguiente hito

Ejemplo: «Completa DS-160 esta semana y agenda biométricos la próxima.»`;
      }
    },
    [provider, model, buildPayload]
  );

  const [input, setInput] = useState("");

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    // Guarda en historial del usuario (global)
    setHistory((prev) => recordHistory(userId, text, prev));

    try { inFlight.current?.abort(); } catch {}
    const controller = new AbortController();
    inFlight.current = controller;

    const me: ChatMessage = { id: uid(), role: "user", content: text, time: nowTs() };
    setMessages((m) => [...m, me]);
    setInput("");
    setIsTyping(true);

    // Auto-título/updated
    const sIdx = sessions.findIndex(s => s.id === sessionId);
    if (sIdx !== -1) {
      const s = sessions[sIdx];
      const next = [...sessions];
      if (!s.title || /^nueva convers/i.test(s.title) || /^conversación\s+\d+$/i.test(s.title)) {
        next[sIdx] = { ...s, title: autoTitleFrom(text), updated: nowTs() };
      } else {
        next[sIdx] = { ...s, updated: nowTs() };
      }
      setSessions(next);
      saveSessions(userId, next);
    }

    try {
      const botId = uid();
      // Pre-crear burbuja asistente para streaming
      setMessages((m) => [...m, { id: botId, role: "assistant", content: "", time: nowTs() }]);

      const throttled = createRafThrottler((acc: string) =>
        setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, content: acc } : msg)))
      );

      // Unificado: /chat/complete_stream
      const payload = { provider, model, ...buildPayload(text) };
      let finalText = "";
      try {
        finalText = await streamToAcc(
          `${API_BASE}${API_STREAM_PATH}`,
          `${API_BASE}/chat/complete`,
          payload,
          throttled,
          controller.signal
        );
      } catch {
        finalText = await getAssistantReply(text, controller.signal);
      }

      setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, content: finalText } : msg)));
      if (speakEnabled) speakStrong(botId, finalText);
    } catch (e) {
      const errMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content:
          "Ups, no pude responder. Verificá que el API esté online, CORS habilitado y el endpoint expuesto.",
        time: nowTs(),
      };
      setMessages((m) => [...m, errMsg]);
      console.error("[ChatMig error]", e);
    } finally {
      if (mounted.current) {
        setIsTyping(false);
        inFlight.current = null;
      }
    }
  }, [input, isTyping, provider, model, buildPayload, getAssistantReply, speakStrong, speakEnabled, sessions, sessionId, userId]);

  const onKey = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ne = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
    if ((ne as any).isComposing || (ne as any).key === "Process") return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }, [send]);

  const copyToClipboard = useCallback((text: string) => {
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand("copy"); } catch {}
        document.body.removeChild(ta);
      } catch {}
    };
    try {
      const navAny = navigator as any;
      if (navAny.clipboard?.writeText) {
        void navAny.clipboard.writeText(text).catch(fallback);
      } else { fallback(); }
    } catch { fallback(); }
  }, []);

  const clearChat = useCallback(() => {
    if (!confirm("¿Limpiar solo la conversación actual?")) return;
    const fresh = [greetingMsg()];
    setMessages(fresh);
    saveMessages(userId, sessionId, fresh);
  }, [userId, sessionId]);

  const clearHistory = useCallback(() => {
    if (!confirm("¿Borrar todo el historial global (prompts enviados) de este usuario?")) return;
    const empty: HistoryItem[] = [];
    saveHistory(userId, empty);
    setHistory(empty);
  }, [userId]);

  const removeHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const next = prev.filter((h) => h.id !== id);
      saveHistory(userId, next);
      return next;
    });
  }, [userId]);

  // ==== Gestión de sesiones ====
  const newSession = useCallback(() => {
    const s: ChatSession = { id: uid(), title: "Nueva conversación", created: nowTs(), updated: nowTs() };
    const list = [s, ...sessions].slice(0, MAX_SESSIONS);
    setSessions(list);
    saveSessions(userId, list);
    saveMessages(userId, s.id, [greetingMsg()]);
    setSessionId(s.id);
    setActiveSessionId(userId, s.id);
    stopSpeak();
    try { inFlight.current?.abort(); } catch {}
  }, [sessions, userId, stopSpeak]);

  const deleteSession = useCallback((id: string) => {
    const s = sessions.find(x => x.id === id);
    if (!s) return;
    if (!confirm(`¿Eliminar la conversación “${s.title || "sin título"}”?`)) return;
    const rest = sessions.filter(x => x.id !== id);
    setSessions(rest);
    saveSessions(userId, rest);
    try { hasWindow && localStorage.removeItem(msgsKeyFor(userId, id)); } catch {}
    if (id === sessionId) {
      const fallback = rest[0]?.id || (() => {
        const n: ChatSession = { id: uid(), title: "Conversación 1", created: nowTs(), updated: nowTs() };
        saveSessions(userId, [n, ...rest]);
        saveMessages(userId, n.id, [greetingMsg()]);
        return n.id;
      })();
      setSessionId(fallback);
      setActiveSessionId(userId, fallback);
      setMessages(loadMessages(userId, fallback));
    }
  }, [sessions, userId, sessionId]);

  const renameSession = useCallback((id: string) => {
    const sIdx = sessions.findIndex(x => x.id === id);
    if (sIdx === -1) return;
    const current = sessions[sIdx].title || "";
    const name = prompt("Nuevo título de la conversación:", current);
    if (name === null) return;
    const title = (name || "").trim() || "Sin título";
    const next = [...sessions];
    next[sIdx] = { ...next[sIdx], title, updated: nowTs() };
    setSessions(next);
    saveSessions(userId, next);
  }, [sessions, userId]);

  // ==== Exportar / Importar ====
  const exportAll = useCallback(() => {
    const bundle: any = {
      version: 1,
      userId,
      exportedAt: new Date().toISOString(),
      sessions,
      messages: sessions.map(s => ({
        sessionId: s.id,
        items: loadMessages(userId, s.id),
      })),
      history: loadHistory(userId),
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chatmig-${userId}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    }, 250);
  }, [userId, sessions]);

  const importAll = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = safeJSONParse<any>(String(reader.result || "{}"), {});
        if (!data || !Array.isArray(data.sessions) || !Array.isArray(data.messages)) {
          alert("JSON inválido: faltan 'sessions' o 'messages'.");
          return;
        }
        if (!confirm("Esto reemplazará tus sesiones, mensajes y el historial de este usuario. ¿Continuar?")) return;

        // Limpiar actuales
        const old = loadSessions(userId);
        for (const s of old) try { hasWindow && localStorage.removeItem(msgsKeyFor(userId, s.id)); } catch {}

        // Guardar nuevas sesiones y mensajes
        const newSessions: ChatSession[] = data.sessions.map((s: any) => ({
          id: String(s.id || uid()),
          title: String(s.title || "Sin título"),
          created: Number(s.created || nowTs()),
          updated: Number(s.updated || nowTs()),
        }));
        saveSessions(userId, newSessions);

        for (const m of data.messages) {
          const sid = String(m.sessionId || "");
          const items: ChatMessage[] = Array.isArray(m.items) ? m.items.map((x: any) => ({
            id: String(x.id || uid()),
            role: (x.role === "assistant" ? "assistant" : "user") as Role,
            content: String(x.content || ""),
            time: Number(x.time || nowTs()),
          })) : [greetingMsg()];
          saveMessages(userId, sid, items);
        }

        // Historial global
        if (Array.isArray(data.history)) {
          const items: HistoryItem[] = data.history.map((h: any) => ({
            id: String(h.id || uid()),
            text: String(h.text || ""),
            time: Number(h.time || nowTs()),
          }));
          saveHistory(userId, items);
          setHistory(items);
        }

        // Activar primera sesión
        const first = newSessions[0]?.id;
        if (first) {
          setActiveSessionId(userId, first);
          setSessionId(first);
          setMessages(loadMessages(userId, first));
        }
        setSessions(newSessions);
        alert("Importación completada ✅");
      } catch (e) {
        console.error(e);
        alert("No se pudo importar el archivo.");
      } finally {
        if (fileRef.current) fileRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }, [userId]);

  const triggerImport = useCallback(() => fileRef.current?.click(), []);

  /* ======================================================================
     Sidebar: historial por usuario (búsqueda + grupos por fecha)
     ==================================================================== */

  const filteredHistory = useMemo(() => {
    const q = histQuery.trim().toLowerCase();
    if (!q) return history;
    return history.filter((h) => h.text.toLowerCase().includes(q));
  }, [history, histQuery]);

  type HistGroup = { dateKey: string; label: string; items: HistoryItem[] };
  const histGroups: HistGroup[] = useMemo(() => {
    const byKey = new Map<string, HistGroup>();
    const now = new Date();
    const todayKey = now.toDateString();
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).toDateString();

    for (const h of filteredHistory) {
      const d = new Date(h.time);
      const key = d.toDateString();
      let label = d.toLocaleDateString([], { day: "2-digit", month: "short" });
      if (key === todayKey) label = "Hoy";
      else if (key === y) label = "Ayer";

      let g = byKey.get(key);
      if (!g) {
        g = { dateKey: key, label, items: [] };
        byKey.set(key, g);
      }
      g.items.push(h);
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const at = new Date(a.dateKey).getTime();
      const bt = new Date(b.dateKey).getTime();
      return bt - at;
    });
  }, [filteredHistory]);

  /* ======================================================================
     Right Panel: handlers stub
     ==================================================================== */
  const handleCheckout = useCallback((chosen: PlanId) => {
    console.log("[checkout:start]", { plan: chosen });
    alert(`Checkout para plan: ${chosen.toUpperCase()}`);
  }, []);

  const handleSignup = useCallback((ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const pass = String(fd.get("password") || "").trim();
    console.log("[signup]", { email });
    alert(`Cuenta creada para: ${email}`);
  }, []);

  const handleLogin = useCallback((ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const pass = String(fd.get("password") || "").trim();
    console.log("[login]", { email });
    alert(`Sesión iniciada: ${email}`);
  }, []);

  /* ======================================================================
     Render
     ===================================================================== */

  // Ajuste de modelo cuando cambia provider
  useEffect(() => {
    const list = MODELS[provider];
    if (!list.some(m => m.id === model)) {
      setModel(list[0]?.id ?? "");
    }
  }, [provider, model]); // deps robustas

  return (
    <div className="cs-root migracion">
      <style>{css}</style>

      {/* ===== Sidebar izquierda ===== */}
      <aside className="cs-sidebar" aria-label="Historial y sesiones">
        <div className="cs-logo">🛂 ChatMig</div>

        {/* Sesiones */}
        <div className="sess-head">
          <div className="sess-actions">
            <button className="cs-chip" onClick={newSession} title="Nueva conversación">➕ Nueva</button>
            <button className="cs-chip" onClick={exportAll} title="Exportar sesiones + historial (JSON)">⬇️ Exportar</button>
            <button className="cs-chip" onClick={triggerImport} title="Importar desde JSON">⬆️ Importar</button>
            <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={importAll} />
          </div>
          <div className="sess-list" role="listbox" aria-label="Conversaciones">
            {sessions.map((s) => (
              <div key={s.id} className={`sess-item ${s.id === sessionId ? "active" : ""}`}>
                <button
                  className="sess-main"
                  onClick={() => {
                    if (s.id !== sessionId) { try { inFlight.current?.abort(); } catch {} }
                    setSessionId(s.id);
                    stopSpeak();
                  }}
                  title={s.title}
                  aria-label={`Abrir ${s.title}`}
                >
                  <span className="sess-title">{s.title || "Sin título"}</span>
                  <span className="sess-time">{new Date(s.updated || s.created).toLocaleDateString([], { day: "2-digit", month: "short" })}</span>
                </button>
                <div className="sess-ops">
                  <button className="sess-op" onClick={() => renameSession(s.id)} title="Renombrar">✎</button>
                  <button className="sess-op danger" onClick={() => deleteSession(s.id)} title="Eliminar">🗑</button>
                </div>
              </div>
            ))}
            {sessions.length === 0 && <div className="hist-empty">No hay conversaciones.</div>}
          </div>
        </div>

        {/* Historial global */}
        <div className="hist-head">
          <div className="hist-user">Usuario <strong>{userId}</strong></div>
          <div className="hist-search">
            <input
              placeholder="Buscar en historial…"
              value={histQuery}
              onChange={(e) => setHistQuery(e.target.value)}
              aria-label="Buscar en historial"
            />
            {histQuery && (
              <button className="hist-clear-search" onClick={() => setHistQuery("")} title="Limpiar búsqueda" aria-label="Limpiar búsqueda">✕</button>
            )}
          </div>
        </div>

        <div className="hist-list" role="navigation" aria-label="Entradas de historial">
          {histGroups.length === 0 ? (
            <div className="hist-empty">Aún no hay historial. Envía tu primera consulta.</div>
          ) : (
            histGroups.map((g) => (
              <div className="hist-group" key={g.dateKey}>
                <div className="hist-date">{g.label}</div>
                <ul>
                  {g.items.map((it) => (
                    <li key={it.id} className="hist-row">
                      <button
                        className="hist-item"
                        title="Reutilizar este prompt"
                        onClick={() => setInput(it.text)}
                        onKeyDown={(ev) => { if ((ev as any).key === "Delete") removeHistoryItem(it.id); }}
                        aria-label={`Usar: ${it.text}`}
                      >
                        <span className="hist-text">{it.text}</span>
                        <span className="hist-time">{fmtTime(it.time)}</span>
                      </button>
                      <button
                        className="hist-del"
                        title="Eliminar de historial"
                        onClick={() => removeHistoryItem(it.id)}
                        aria-label="Eliminar entrada"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div className="hist-footer">
          <button className="cs-chip" onClick={clearHistory} title="Borrar todo el historial">🧹 Limpiar historial</button>
          <div className="cs-small">
            v6.1 — Right Panel Login/Membresías • Drawer móvil • Persistencia
          </div>
        </div>
      </aside>

      {/* ===== Main ===== */}
      <main className="cs-main" role="main" aria-busy={isTyping}>
        <header className="cs-topbar">
          <div className="cs-title">Chat estilo ChatGPT — Migración</div>

          {/* Selector de Agente + Proveedor + Modelo */}
          <div className="cs-model" aria-label="Selección de agente y modelo">
            <span className="dot" />
            <div className="selectors">
              <label className="cs-select">
                <span>Agente</span>
                <select
                  className="cm-select"
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  aria-label="Agente"
                >
                  {AGENTS.map(a => (
                    <option key={a.id} value={a.id} title={a.desc}>{a.name}</option>
                  ))}
                </select>
              </label>

              <label className="cs-select">
                <span>Proveedor</span>
                <select
                  className="cm-select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderId)}
                  aria-label="Proveedor"
                >
                  {(Object.keys(MODELS) as ProviderId[]).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="cs-select">
                <span>Modelo</span>
                <select
                  className="cm-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  aria-label="Modelo"
                >
                  {MODELS[provider].map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>

              <div className="cs-ready">{voicesReady && hasSpeechSynthesis ? "· Voz lista" : ""}</div>

              {/* Toggle Panel Derecho */}
              <button
                className="cs-chip"
                onClick={() => setRightOpen(v => !v)}
                aria-expanded={rightOpen}
                aria-controls="right-panel"
                title="Abrir/Cerrar Login & Membresías"
              >
                👤 Acceso & Membresías
              </button>
            </div>
          </div>
        </header>

        {errorText && (
          <div className="cs-error" role="alert">
            ⚠️ {errorText}
          </div>
        )}

        <div className="cs-list" ref={listRef} role="log" aria-live="polite">
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              onCopy={(t) => copyToClipboard(t)}
              onSpeak={() => speakStrong(m.id, m.content)}
              onStop={stopSpeak}
              isSpeaking={speakingId === m.id}
              ttsReady={!!hasSpeechSynthesis}
              ttsBusy={speakingId !== null}
            />
          ))}
          {isTyping && <TypingBubble />}
        </div>

        {/* Barra inferior */}
        <div className="cs-toolbar">
          <button className="cs-chip" type="button" onClick={clearChat} title="Limpiar conversación actual">🧽 Limpiar conversación</button>
          <button className="cs-chip" type="button" onClick={stopStreaming} disabled={!isTyping} title="Detener generación" aria-disabled={!isTyping}>⏹ Detener</button>

          <button
            className="cs-chip"
            type="button"
            onClick={startDictation}
            disabled={!hasSpeechRec || dictating}
            title="Dictar con el micrófono"
            aria-disabled={!hasSpeechRec || dictating}
          >
            {dictating ? "🎙️ Escuchando…" : "🎙️ Dictar"}
          </button>

          <button
            className="cs-chip"
            type="button"
            onClick={() => setSpeakEnabled((v) => !v)}
            title="Alternar auto-lectura de respuestas"
            aria-pressed={speakEnabled}
          >
            🔊 Auto-voz: {speakEnabled ? "ON" : "OFF"}
          </button>

          <button
            className="cs-chip"
            type="button"
            onClick={() => setSanitizeRead((v) => !v)}
            title="Ignorar signos/Markdown al leer"
            aria-pressed={sanitizeRead}
          >
            🧼 Lectura limpia: {sanitizeRead ? "ON" : "OFF"}
          </button>

          <label className="cs-chip" title="Idioma TTS / Dictado" htmlFor="lang-input">
            🌐 Idioma:&nbsp;
            <input
              id="lang-input"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              aria-label="Idioma de TTS y dictado"
              style={{ background: "transparent", border: 0, color: "inherit", inlineSize: 64 }}
            />
          </label>
        </div>

        <div className="cs-chips" aria-label="Sugerencias rápidas">
          {[
            "Checklist de visa de turista (EEUU)",
            "¿Soy elegible para visa de estudiante?",
            "Costos y tiempos consulares aproximados",
            "Guíame con DS-160 paso a paso",
          ].map((c) => (
            <button key={c} className="cs-chip" type="button" onClick={() => setInput((s) => (s ? s + "\n" + c : c))}>
              {c}
            </button>
          ))}
        </div>

        <div className="cs-input">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Escribe tu consulta (país, tipo de visa, fechas)… (Enter = enviar, Shift+Enter = salto)"
            aria-label="Mensaje para ChatMig"
          />
          <button
            className="cs-send"
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || isTyping}
            aria-disabled={!input.trim() || isTyping}
            aria-label="Enviar mensaje"
            title="Enviar (Enter)"
          >
            {isTyping ? "…" : "Enviar"}
          </button>
        </div>

        {/* 👇 NEW: Foto flotante mientras el agente habla */}
        {speakingId && (
          <div className="talking-fab" aria-hidden="true" title="Agente hablando…">
            <img src={AGENT_AVATAR_URL} alt="Agente" />
            <div className="ring" />
          </div>
        )}
      </main>

      {/* ===== Right Panel (Login/Membresías) ===== */}
      <aside
        id="right-panel"
        className={`rp ${rightOpen ? "open" : ""}`}
        aria-hidden={!rightOpen}
        aria-label="Acceso y Membresías"
        role="complementary"
      >
        <div className="rp-header">
          <div className="rp-title">Acceso & Membresías</div>
          <button className="rp-close" onClick={() => setRightOpen(false)} aria-label="Cerrar panel">✕</button>
        </div>

        <div className="rp-tabs" role="tablist" aria-label="Autenticación">
            <button
              role="tab"
              aria-selected={authTab === "signup"}
              className={`rp-tabbtn ${authTab === "signup" ? "active" : ""}`}
              onClick={() => setAuthTab("signup")}
            >
              Crear cuenta
            </button>
            <button
              role="tab"
              aria-selected={authTab === "login"}
              className={`rp-tabbtn ${authTab === "login" ? "active" : ""}`}
              onClick={() => setAuthTab("login")}
            >
              Iniciar sesión
            </button>
        </div>

        <div className="rp-content">
          {authTab === "signup" ? (
            <form className="rp-section" onSubmit={handleSignup} aria-label="Formulario de registro">
              <label className="rp-field">
                <span>Email</span>
                <input name="email" type="email" placeholder="tucorreo@ejemplo.com" required />
              </label>
              <label className="rp-field">
                <span>Contraseña</span>
                <input name="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8} />
              </label>
              <button className="rp-cta" type="submit">Crear cuenta</button>
            </form>
          ) : (
            <form className="rp-section" onSubmit={handleLogin} aria-label="Formulario de inicio de sesión">
              <label className="rp-field">
                <span>Email</span>
                <input name="email" type="email" placeholder="tucorreo@ejemplo.com" required />
              </label>
              <label className="rp-field">
                <span>Contraseña</span>
                <input name="password" type="password" placeholder="Tu contraseña" required />
              </label>
              <button className="rp-cta" type="submit">Entrar</button>
            </form>
          )}

          <div className="rp-section">
            <div className="rp-subtitle">Membresías</div>
            <div className="plan-cards" role="radiogroup" aria-label="Selecciona un plan">
              <label className={`plan-card ${plan === "free" ? "selected" : ""}`}>
                <input type="radio" name="plan" value="free" checked={plan === "free"} onChange={() => setPlan("free")} />
                <div className="p-name">Free</div>
                <div className="p-price">$0</div>
                <ul className="p-list">
                  <li>Mensajes básicos</li>
                  <li>Sin TTS automático</li>
                </ul>
                <button type="button" className="p-cta" onClick={() => handleCheckout("free")}>Seguir con Free</button>
              </label>

              <label className={`plan-card ${plan === "pro" ? "selected" : ""}`}>
                <input type="radio" name="plan" value="pro" checked={plan === "pro"} onChange={() => setPlan("pro")} />
                <div className="p-name">Pro</div>
                <div className="p-price">$20</div>
                <ul className="p-list">
                  <li>Modelos premium</li>
                  <li>Audio TTS incluido</li>
                </ul>
                <button type="button" className="p-cta" onClick={() => handleCheckout("pro")}>Elegir Pro</button>
              </label>

              <label className={`plan-card ${plan === "premium" ? "selected" : ""}`}>
                <input type="radio" name="plan" value="premium" checked={plan === "premium"} onChange={() => setPlan("premium")} />
                <div className="p-name">Premium</div>
                <div className="p-price">$50</div>
                <ul className="p-list">
                  <li>Todo Pro + Prioridad</li>
                  <li>Herramientas avanzadas</li>
                </ul>
                <button type="button" className="p-cta" onClick={() => handleCheckout("premium")}>Ir a Premium</button>
              </label>
            </div>
          </div>

          <div className="rp-section rp-hint">
            <div className="cs-small">Acciones stub listas para conectar: <code>handleSignup</code>, <code>handleLogin</code> y <code>handleCheckout(plan)</code>. Puedes reemplazarlas por tus llamadas a API o tu <em>PayPalWidget</em>.</div>
          </div>
        </div>
      </aside>

      {/* Overlay para móviles */}
      <div
        className={`rp-overlay ${rightOpen ? "show" : ""}`}
        aria-hidden={!rightOpen}
        onClick={() => setRightOpen(false)}
      />
    </div>
  );
}

/* ========================================================================
   Subcomponentes
   ===================================================================== */

const MessageBubble = memo(function MessageBubble({
  msg,
  onCopy,
  onSpeak,
  onStop,
  isSpeaking,
  ttsReady,
  ttsBusy,
}: {
  msg: ChatMessage;
  onCopy: (t: string) => void;
  onSpeak: () => void;
  onStop: () => void;
  isSpeaking: boolean;
  ttsReady: boolean;
  ttsBusy: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`cs-msg ${isUser ? "user" : "assistant"}`}
      role="article"
      aria-label={isUser ? "Mensaje del usuario" : "Respuesta del asistente"}
    >
      <div className={`cs-avatar ${!isUser && isSpeaking ? "speaking" : ""}`} aria-hidden="true">
        {isUser ? (
          "🧑"
        ) : (
          <img
            src={AGENT_AVATAR_URL}
            alt="Agente"
            className="avatar-img"
          />
        )}
      </div>
      <div className="cs-bubble">
        <div className="cs-content">{renderRichText(msg.content)}</div>
        <div className="cs-meta">
          <span>{isUser ? "Tú" : "ChatMig"} · {fmtTime(msg.time)}</span>
          {!isUser && (
            <button
              className="cs-copy"
              type="button"
              onClick={isSpeaking ? onStop : onSpeak}
              title={isSpeaking ? "Detener lectura" : "Leer respuesta"}
              disabled={!ttsReady || (!isSpeaking && ttsBusy)}
              aria-disabled={!ttsReady || (!isSpeaking && ttsBusy)}
            >
              {isSpeaking ? "⏹ Detener" : "🔊 Leer"}
            </button>
          )}
          <button className="cs-copy" type="button" onClick={() => onCopy(msg.content)} title="Copiar contenido">
            Copiar
          </button>
        </div>
      </div>
    </div>
  );
});

const TypingBubble = memo(function TypingBubble() {
  return (
    <div className="cs-msg assistant" aria-live="polite">
      <div className="cs-avatar" aria-hidden="true">🤖</div>
      <div className="cs-bubble typing">
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
});

/* ========================================================================
   Render enriquecido
   ===================================================================== */

function renderRichText(text: string): React.ReactNode {
  const lines = (text || "").split("\n");
  let introDone = false;

  return (
    <>
      {lines.map((raw, i) => {
        const line = raw ?? "";
        const t = line.trim();
        if (t === "") return <br key={i} />;

        if (t.startsWith("«") && t.endsWith("»") && t.length > 2) {
          const inner = t.slice(1, -1);
          return (
            <div key={i} className="cs-hero-quote">
              <u>{inner}</u>
            </div>
          );
        }

        if (t.startsWith(">")) {
          const inner = t.replace(/^>\s?/, "");
          return (
            <blockquote key={i} className="cs-quote">
              {renderInline(inner)}
            </blockquote>
          );
        }

        const hmatch = /^(#{1,6})\s*(.+)$/.exec(t);
        if (hmatch) {
          const level = Math.min(6, hmatch[1].length);
          const content = hmatch[2];
          return (
            <div key={i} className={`cs-h cs-h${level}`}>
              {renderInline(content)}
            </div>
          );
        }

        const om = /^\s*(\d+)[\.\)]\s+(.+)$/.exec(line);
        if (om) {
          return (
            <div key={i} className="ol-item">
              <span className="ol-num">{om[1]}.</span>
              <span className="ol-text">{renderInline(om[2])}</span>
            </div>
          );
        }

        const bm = /^(\s*[-•]\s*)(.+)$/.exec(line);
        if (bm) {
          return (
            <div key={i} className="detail-line">
              <span className="bullet">{bm[1]}</span>
              <span className="detail">{renderInline(bm[2])}</span>
            </div>
          );
        }

        if (!introDone) {
          introDone = true;
          return <div key={i} className="cs-intro">{renderInline(line)}</div>;
        }

        return (
          <span key={i}>
            {renderInline(line)}
            {i < lines.length - 1 && <br />}
          </span>
        );
      })}
    </>
  );
}

function renderInline(text: string): React.ReactNode[] {
  const boldParts = splitBold(text);
  const afterKeys = boldParts.flatMap((part, idx) =>
    typeof part === "string" ? wrapKeywords(part, idx) : [part]
  );
  const afterQuotes = afterKeys.flatMap((part, idx) =>
    typeof part === "string" ? wrapInnerQuotes(part, idx) : [part]
  );
  return afterQuotes;
}

function splitBold(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(<strong key={m.index}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  if (out.length === 0) out.push(line);
  return out;
}

const KEY_RE = /(Razonamiento|Paso(?:\s*\d+)?|Ejemplo|Consejo|Importante|Advertencia|Riesgo|Alerta|Nota):/gi;
function wrapKeywords(s: string, key: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = KEY_RE.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    parts.push(<span className="hl-key" key={`${key}-k-${m.index}`}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

const QUOTE_RE = /"(.*?)"|“(.*?)”/g;
function wrapInnerQuotes(s: string, key: number): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = QUOTE_RE.exec(s)) !== null) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const inner = m[1] ?? m[2] ?? "";
    parts.push(<q className="q-inline" key={`${key}-q-${m.index}`}>{inner}</q>);
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

/* ========================================================================
   CSS
   ===================================================================== */

const css = `
:root{
  --bg:#081019;
  --panel:#0f172a;
  --sub:#cbd5e1;
  --text:#eaf2ff;
  --line:#1f2937;
  --acc:#3b82f6;
  --acc-2:#ef4444;
  --vio:#7c3aed;
  --glow:#60a5fa;
  --glow-red:#f87171;

  /* Select Azul + texto blanco */
  --cm-blue:#1b67ff;
  --cm-blue-600:#1553cc;
}

.migracion{
  background:
    radial-gradient(1200px 520px at 8% -10%, rgba(59,130,246,.20), transparent),
    radial-gradient(900px 400px at 92% 6%, rgba(239,68,68,.18), transparent),
    radial-gradient(1000px 600px at 50% 120%, rgba(124,58,237,.15), transparent),
    var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
  background-size: 120% 120%, 120% 120%, 140% 140%, auto;
  animation: pan-bg 26s linear infinite;
  will-change: background-position;
}
@keyframes pan-bg{
  0%   { background-position: 0% 0%, 100% 0%, 50% 120%, 0 0; }
  50%  { background-position: 100% 0%, 0% 0%, 50% 110%, 0 0; }
  100% { background-position: 0% 0%, 100% 0%, 50% 120%, 0 0; }
}
@media (prefers-reduced-motion: reduce){ .migracion{ animation: none; } }

.cs-root{ display:flex; block-size:100dvh }
.cs-sidebar{
  inline-size:300px; border-inline-end:1px solid var(--line); padding:16px;
  display:flex; flex-direction:column; gap:12px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.08)), var(--panel);
  backdrop-filter:saturate(110%) blur(2px);
}
.cs-logo{ font-weight:900; letter-spacing:.3px; font-size:18px }

/* ===== Sesiones ===== */
.sess-head{ display:flex; flex-direction:column; gap:8px }
.sess-actions{ display:flex; gap:6px; flex-wrap:wrap }
.sess-list{ display:flex; flex-direction:column; gap:6px; max-block-size:180px; overflow:auto; border:1px dashed var(--line); border-radius:12px; padding:8px }
.sess-item{ display:flex; gap:6px; align-items:stretch }
.sess-item.active .sess-main{ border-color: rgba(96,165,250,.45); background: linear-gradient(90deg, rgba(59,130,246,.12), rgba(239,68,68,.10)); box-shadow: 0 2px 12px rgba(2,6,23,.3) }
.sess-main{
  flex:1; text-align:start; background:transparent; color:var(--text);
  border:1px solid var(--line); border-radius:10px; padding:8px 10px; cursor:pointer;
  display:flex; flex-direction:column; gap:4px;
}
.sess-title{ font-size:13px; line-height:1.35; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:1; overflow:hidden }
.sess-time{ font-size:11px; color:var(--sub) }
.sess-ops{ display:flex; gap:4px }
.sess-op{ border:1px solid var(--line); background:transparent; color:var(--sub); border-radius:8px; padding:6px; cursor:pointer }
.sess-op.danger{ border-color: rgba(248,113,113,.35); color:#fecaca }

/* ===== Historial ===== */
.hist-head{ display:flex; flex-direction:column; gap:8px }
.hist-user{ font-size:12px; color:var(--sub) }
.hist-search{ position:relative }
.hist-search input{
  inline-size:100%; padding:8px 28px 8px 10px; border-radius:10px; border:1px solid var(--line);
  background: rgba(255,255,255,.02); color:var(--text); outline:none
}
.hist-clear-search{
  position:absolute; inset-inline-end:6px; inset-block-start:6px;
  border:1px solid var(--line); background:transparent; color:var(--sub); border-radius:8px; padding:2px 6px; cursor:pointer
}
.hist-list{ overflow:auto; flex:1; border:1px dashed var(--line); border-radius:12px; padding:8px }
.hist-empty{ color:var(--sub); font-size:12px; padding:8px }
.hist-group{ margin-block:8px }
.hist-date{ color:#93c5fd; font-weight:800; font-size:12px; letter-spacing:.3px; margin:6px 6px }
.hist-row{ display:flex; align-items:center; gap:6px; list-style:none; padding:2px 0 }
.hist-item{
  flex:1; text-align:start; background:transparent; color:var(--text);
  border:1px solid var(--line); border-radius:10px; padding:8px 10px; cursor:pointer;
  display:flex; flex-direction:column; gap:4px;
  transition: background .15s ease, border-color .15s ease, box-shadow .2s ease
}
.hist-item:hover{
  background: linear-gradient(90deg, rgba(59,130,246,.12), rgba(239,68,68,.10));
  border-color: rgba(96,165,250,.35);
  box-shadow: 0 2px 10px rgba(2,6,23,.3);
}
.hist-text{
  font-size:13px; line-height:1.35; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden
}
.hist-time{ font-size:11px; color:var(--sub) }
.hist-del{
  border:1px solid var(--line); background:transparent; color:var(--sub); border-radius:8px; padding:6px; cursor:pointer;
}
.hist-footer{ margin-block-start:auto; display:flex; flex-direction:column; gap:8px }

/* ===== Main ===== */
.cs-main{ flex:1; display:flex; flex-direction:column; block-size:100% }
.cs-topbar{
  block-size:58px; display:flex; align-items:center; justify-content:space-between;
  padding-inline:18px; border-block-start:1px solid transparent; border-block-end:1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10));
  backdrop-filter: blur(6px);
}
.cs-title{ font-weight:900 }
.cs-model{ display:flex; align-items:center; gap:8px; color:var(--sub) }
.cs-model .dot{
  inline-size:10px; block-size:10px; border-radius:999px;
  background: conic-gradient(from 0deg, var(--acc), var(--vio), var(--acc-2), var(--acc));
  animation: pulse-dot 2.2s ease-out infinite;
  box-shadow: 0 0 10px rgba(96,165,250,.75);
}
.selectors{ display:flex; gap:10px; align-items:center; flex-wrap:wrap }
.cs-ready{ color:var(--sub); font-size:12px }

@keyframes pulse-dot{
  0%{ transform:scale(1); box-shadow:0 0 0 0 rgba(96,165,250,.6) }
  70%{ transform:scale(1.15); box-shadow:0 0 0 12px rgba(96,165,250,0) }
  100%{ transform:scale(1); box-shadow:0 0 0 0 rgba(96,165,250,0) }
}

/* ===== Selects: menú azul + texto blanco ===== */
.cs-select{ display:flex; flex-direction:column; gap:4px; font-size:12px }
.cs-select span{ color:var(--sub) }
.cm-select{
  appearance:none; -webkit-appearance:none;
  background-color: var(--cm-blue);
  color:#fff;
  border:1px solid rgba(255,255,255,.15);
  border-radius:10px;
  padding:8px 12px;
  outline:none; cursor:pointer;
  background-image:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'><path d='M1 1l4 4 4-4' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>");
  background-repeat:no-repeat;
  background-position:right 10px center;
  padding-right:30px;
}
.cm-select:focus{
  box-shadow:0 0 0 3px rgba(27,103,255,.35);
  border-color:rgba(255,255,255,.3);
}
.cm-select:disabled{ opacity:.6; cursor:not-allowed; }
.cm-select option{
  color:#fff;
  background-color: var(--cm-blue-600);
}

/* ===== Lista ===== */
.cs-list{ flex:1; overflow:auto; padding:22px 18px; display:flex; flex-direction:column; gap:16px }

/* ====== MENSAJES ====== */
.cs-msg{ display:flex; align-items:flex-start; gap:12px; max-inline-size:980px }
.cs-msg.user{ align-self:flex-end }
.cs-avatar{
  inline-size:36px; block-size:36px; display:grid; place-items:center; border-radius:10px;
  background:#0b1220; border:1px solid var(--line);
}
.cs-msg.user .cs-avatar{ background:#1a1220 }

/* 👇 NEW: imagen como avatar y anillo pulsante cuando está hablando */
.cs-avatar img.avatar-img{
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
  border-radius: 10px;
  display: block;
}
.cs-avatar.speaking{
  border-color: rgba(96,165,250,.65);
  box-shadow: 0 0 0 0 rgba(96,165,250,.55);
  animation: speakPulse 1.6s ease-out infinite;
}
@keyframes speakPulse{
  0%   { box-shadow: 0 0 0 0 rgba(96,165,250,.55); }
  70%  { box-shadow: 0 0 0 14px rgba(96,165,250,0); }
  100% { box-shadow: 0 0 0 0 rgba(96,165,250,0); }
}

.cs-bubble{
  position:relative; padding:14px 16px; border-radius:16px; border:1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10));
  box-shadow: 0 6px 24px rgba(2,6,23,.35), inset 0 0 0 1px rgba(255,255,255,.02);
}
.cs-msg.assistant .cs-bubble{
  background:
    radial-gradient(600px 220px at 0% 0%, rgba(59,130,246,.18), transparent),
    radial-gradient(600px 220px at 100% 0%, rgba(239,68,68,.15), transparent),
    linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.12));
  border-color: rgba(96,165,250,.25);
  box-shadow:
    0 8px 28px rgba(2,6,23,.45),
    0 0 24px -6px rgba(96,165,250,.45),
    inset 0 0 0 1px rgba(255,255,255,.04);
}
.cs-msg.user .cs-bubble{
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.06));
  border-color: rgba(248,113,113,.22);
  box-shadow: 0 6px 22px rgba(2,6,23,.35), 0 0 16px -8px rgba(248,113,113,.35);
}

.cs-content{ white-space:pre-wrap; line-height:1.55 }

/* —— Intro grande —— */
.cs-intro{
  font-size:22px; font-style:italic; font-weight:900; line-height:1.35; margin:2px 0 10px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6, #ef4444);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 0 18px rgba(96,165,250,.25);
}

/* —— Headings —— */
.cs-h{ margin:8px 0 6px; font-weight:800; letter-spacing:.2px }
.cs-h1{ font-size:26px } .cs-h2{ font-size:22px } .cs-h3{ font-size:19px }
.cs-h4{ font-size:17px } .cs-h5{ font-size:16px } .cs-h6{ font-size:15px }

/* —— Lista numerada —— */
.ol-item{ display:flex; gap:10px; align-items:flex-start; padding:6px 0; line-height:1.65; letter-spacing:.2px }
.ol-num{ min-inline-size:28px; text-align:end; font-weight:900; color:#93c5fd }
.ol-text{ flex:1; font-style:italic }

/* —— Bullets —— */
.detail-line{ color: var(--acc) }
.detail-line .bullet{ color:var(--text); opacity:.8 }
.detail{ color: var(--acc) }

/* —— Palabras clave —— */
.hl-key{
  color: var(--acc-2);
  text-decoration: underline;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  font-weight: 900;
  text-shadow: 0 0 10px rgba(248,113,113,.25);
}

/* —— Citas internas —— */
.q-inline{ font-style:italic; opacity:.95 }

/* —— Blockquote —— */
.cs-quote{
  margin:8px 0; padding:8px 12px; border-inline-start:3px solid var(--acc-2);
  background: rgba(255,255,255,.04); color:#ffe9f4; font-style:italic; border-radius:8px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.03);
}

/* —— Hero quote —— */
.cs-hero-quote{
  text-align:center; font-weight:900; font-size:18px; line-height:1.35; margin:10px auto 12px; max-inline-size:780px; letter-spacing:.2px;
  background: linear-gradient(90deg, #60a5fa, #3b82f6, #ef4444);
  -webkit-background-clip:text; background-clip:text; color:transparent;
  text-decoration: underline; text-decoration-color:#ef4444; text-decoration-thickness:3px; text-underline-offset:6px;
  text-shadow: 0 0 18px rgba(96,165,250,.25);
}

.cs-meta{ display:flex; gap:12px; align-items:center; font-size:12px; color:var(--sub); margin-block-start:8px }
.cs-copy{
  margin-inline-start:auto; background:transparent; color:var(--sub);
  border:1px solid var(--line); border-radius:8px; padding:4px 8px; cursor:pointer;
  transition: box-shadow .25s ease, border-color .25s ease, color .25s ease;
}
.cs-copy:hover{
  color:var(--text); border-color: rgba(96,165,250,.45);
  box-shadow: 0 0 14px rgba(96,165,250,.35);
}

/* ====== “escribiendo…” ====== */
.typing{ display:inline-flex; gap:6px; align-items:center; min-inline-size:60px }
.typing .dot{
  inline-size:8px; block-size:8px; border-radius:999px;
  background: linear-gradient(180deg, #60a5fa, #ef4444);
  animation: bop 1.1s infinite;
  box-shadow: 0 0 10px rgba(96,165,250,.6);
}
.typing .dot:nth-child(2){ animation-delay:.15s }
.typing .dot:nth-child(3){ animation-delay:.3s }
@keyframes bop{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-4px) } }

/* ====== Chips/Toolbar ====== */
.cs-chips{ display:flex; flex-wrap:wrap; gap:8px; padding:0 18px 10px }
.cs-toolbar{ display:flex; gap:8px; padding:6px 18px 2px; flex-wrap:wrap }

/* ====== Input & botón Enviar ====== */
.cs-input{
  display:flex; gap:10px; padding: 12px 18px 18px; border-block-start:1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10)); backdrop-filter: blur(8px)
}
.cs-input textarea{
  flex:1; resize:none; max-block-size:160px; min-block-size:52px; padding:12px 14px;
  border-radius:14px; border:1px solid var(--line);
  background: rgba(255,255,255,.02); color: var(--text); outline:none
}
.cs-send{
  background: linear-gradient(135deg, var(--acc), var(--acc-2));
  color:#0b1020; border:0; border-radius:12px; padding:0 16px; font-weight:900; min-inline-size:96px; cursor:pointer;
  position:relative; overflow:hidden; transition: transform .08s ease-in-out, box-shadow .25s ease;
  box-shadow: 0 8px 28px rgba(59,130,246,.25), 0 0 0 1px rgba(255,255,255,.04) inset;
}
.cs-send::after{
  content:""; position:absolute; inset:0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.28), transparent);
  transform: translateX(-200%); transition: transform .8s ease;
}
.cs-send:hover::after{ transform: translateX(200%) }
.cs-send:hover{ box-shadow: 0 12px 36px rgba(59,130,246,.35), 0 0 24px -10px rgba(239,68,68,.45) }
.cs-send:active{ transform: translateY(1px) }
.cs-send:disabled{ opacity:.6; cursor:not-allowed }

/* ====== Error ====== */
.cs-error{ margin:10px 18px 0; padding:10px 12px; border:1px solid rgba(248,113,113,.35); color:#fecaca; background: rgba(127,29,29,.25); border-radius:10px }

/* ====== Responsive ====== */
@media (max-width:980px){ .cs-sidebar{ display:none } }

.cs-chip{
  background: transparent; color: var(--text);
  border:1px dashed var(--line); border-radius:999px; padding:6px 10px; cursor:pointer;
  transition: background .25s ease, box-shadow .25s ease, border-color .25s ease; font-size:12px
}
.cs-chip:hover{
  background: linear-gradient(90deg, rgba(59,130,246,.15), rgba(239,68,68,.12));
  border-color: rgba(96,165,250,.35);
  box-shadow: 0 4px 16px rgba(2,6,23,.4);
}

/* ====== Right Panel (Login/Membresías) ====== */
.rp{
  position: fixed; inset-block:0; inset-inline-end:0; inline-size: 400px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.14)), var(--panel);
  border-inline-start: 1px solid var(--line);
  transform: translateX(100%);
  transition: transform .28s ease, box-shadow .28s ease;
  z-index: 40;
  display:flex; flex-direction:column;
  box-shadow: -16px 0 48px rgba(2,6,23,.55);
}
.rp.open{ transform: translateX(0) }
.rp-header{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-block-end:1px solid var(--line) }
.rp-title{ font-weight:900; letter-spacing:.3px }
.rp-close{ border:1px solid var(--line); background:transparent; color:var(--sub); border-radius:10px; padding:6px 10px; cursor:pointer }

.rp-tabs{ display:flex; gap:8px; padding:10px 12px; border-block-end:1px dashed var(--line) }
.rp-tabbtn{ flex:1; background:transparent; color:var(--text); border:1px dashed var(--line); border-radius:999px; padding:8px 10px; cursor:pointer; font-size:12px }
.rp-tabbtn.active{ background: linear-gradient(90deg, rgba(59,130,246,.15), rgba(239,68,68,.12)); border-color: rgba(96,165,250,.45); box-shadow: 0 4px 16px rgba(2,6,23,.4) }

.rp-content{ overflow:auto; padding:12px 12px 18px; display:flex; flex-direction:column; gap:14px }
.rp-section{ border:1px dashed var(--line); border-radius:12px; padding:12px; display:flex; flex-direction:column; gap:10px; background: rgba(255,255,255,.02) }
.rp-field{ display:flex; flex-direction:column; gap:6px }
.rp-field span{ font-size:12px; color:var(--sub) }
.rp-field input{ padding:10px 12px; border-radius:10px; border:1px solid var(--line); background: rgba(255,255,255,.02); color:var(--text); outline:none }
.rp-cta{ align-self:flex-start; background: linear-gradient(135deg, var(--acc), var(--acc-2)); color:#0b1020; border:0; border-radius:12px; padding:8px 14px; font-weight:900; cursor:pointer; box-shadow: 0 8px 28px rgba(59,130,246,.25) }
.rp-subtitle{ font-weight:900; letter-spacing:.3px }

.plan-cards{ display:grid; grid-template-columns: 1fr; gap:10px }
@media (min-width:560px){ .plan-cards{ grid-template-columns: 1fr 1fr; } }
.plan-card{ position:relative; border:1px solid var(--line); border-radius:14px; padding:12px; display:flex; flex-direction:column; gap:8px; background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.04) }
.plan-card input{ position:absolute; inset-block-start:10px; inset-inline-end:10px }
.plan-card.selected{ border-color: rgba(96,165,250,.45); box-shadow: 0 8px 26px rgba(2,6,23,.45), 0 0 18px -8px rgba(96,165,250,.55) }
.p-name{ font-weight:900 }
.p-price{ font-size:22px; font-weight:900; color:#93c5fd }
.p-list{ margin:0; padding-inline-start:18px; color:var(--sub); font-size:13px; display:flex; flex-direction:column; gap:4px }
.p-cta{ align-self:flex-start; background:transparent; color:var(--text); border:1px dashed var(--line); border-radius:10px; padding:8px 12px; cursor:pointer }
.p-cta:hover{ border-color: rgba(96,165,250,.45); box-shadow: 0 4px 16px rgba(2,6,23,.4) }

.rp-hint .cs-small{ color:var(--sub) }

/* Overlay (móvil) */
.rp-overlay{ position: fixed; inset:0; background: rgba(0,0,0,.0); opacity:0; pointer-events:none; transition: opacity .25s ease; z-index: 35 }
.rp-overlay.show{ opacity:.55; pointer-events:auto }
@media (min-width: 981px){ .rp-overlay{ display:none } }

/* 👇 NEW: foto flotante mientras habla */
.talking-fab{
  position: fixed;
  inset-inline-end: 18px;
  inset-block-end: 90px;
  inline-size: 64px;
  block-size: 64px;
  border-radius: 50%;
  background: #0b1220;
  border: 2px solid rgba(96,165,250,.6);
  box-shadow: 0 10px 30px rgba(2,6,23,.55), 0 0 0 6px rgba(96,165,250,.15);
  z-index: 60;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.talking-fab img{
  inline-size: 100%;
  block-size: 100%;
  object-fit: cover;
}
.talking-fab .ring{
  position: absolute;
  inset: -6px;
  border-radius: 999px;
  box-shadow: 0 0 0 0 rgba(96,165,250,.45);
  animation: speakPulse 1.6s ease-out infinite;
  pointer-events: none;
}
`;

