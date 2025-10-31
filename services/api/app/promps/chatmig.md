import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ChatMigUI — Frontend solo chat (sin backend)
 *
 * ✔ Visual moderno (glass + gradientes)
 * ✔ Sidebar mínima con historial (mock)
 * ✔ Acciones por mensaje (copiar) con fallback
 * ✔ Chips de prompts rápidos (tema migratorio)
 * ✔ Atajos: Enter = enviar, Shift+Enter = salto
 * ✔ Simulación de “escribiendo…”
 * ✔ Hook de integración a API (comentado, listo)
 *
 * Si lo usás como .md, dejá el bloque code tal cual.
 * Si lo usás en tu proyecto Vite/React:
 * - Guardá como src/ChatMigUI.tsx
 * - Renderizá <ChatMigUI /> en tu App
 */

// Tipos
type Role = "user" | "assistant" | "system";
interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  time: number;
}

// Utils
const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2));

const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Componente
export default function ChatMigUI() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: uid(),
      role: "assistant",
      time: Date.now(),
      content:
        "¡Bienvenid@ a **ChatMig**! Contame tu caso (país, tipo de visa, fechas) y te doy **requisitos**, **costos**, **tiempos** y **siguientes pasos**. Tip: activá “LLM completo” para respuestas detalladas.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(
    (localStorage.getItem("chatmig.theme") as "dark" | "light") || "dark"
  );

  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const inflightRef = useRef<AbortController | null>(null);

  // Persistir tema
  useEffect(() => {
    try {
      localStorage.setItem("chatmig.theme", theme);
    } catch {}
  }, [theme]);

  // Auto-scroll al final
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages, isTyping]);

  // Auto-grow del textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, [input]);

  // Mock de respuesta (reemplazar por tu API si querés)
  async function getAssistantReply(userText: string): Promise<string> {
    // Ejemplo de integración real:
    // try {
    //   const ctrl = new AbortController();
    //   inflightRef.current = ctrl;
    //   const r = await fetch("http://127.0.0.1:8000/chat/plan", {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json" },
    //     signal: ctrl.signal,
    //     body: JSON.stringify({ goal: userText, context: { channel: "chatmig" } }),
    //   });
    //   if (!r.ok) throw new Error(`HTTP ${r.status}`);
    //   const data = await r.json();
    //   return `Plan express:\n- ${(data?.steps ?? []).join("\n- ")}\n\nScript sugerido:\n${data?.script ?? ""}`;
    // } catch {}

    const variants = [
      `Resumen: querés «${userText}».\nRequisitos típicos: pasaporte vigente, foto, formulario + pago.\nPlan:\n1) Identificar visa exacta.\n2) Completar formulario online.\n3) Pagar arancel.\n4) Agendar biométricos/entrevista.\nSiguiente paso hoy: reunir documentos base y validar elegibilidad.`,
      `Para «${userText}»:\n- Documentos base: pasaporte, antecedentes, foto.\n- Tiempos: consulado 2–8 semanas (variable).\n- Costos: arancel + centro de visa (si aplica).\nTarea del día: crear checklist y cargar PDFs en una carpeta.`,
      `Dos guiones de contacto con consulado/centro:\nA) “Hola, quiero consultar disponibilidad de cita para [tipo de visa] en [ciudad]. ¿Hay turnos en las próximas 4–6 semanas?”\nB) “Buenas, ¿confirman recepción de mis documentos para [caso #]? Necesito saber ETA de revisión.”\nMétrica: 1 gestión enviada hoy.`,
    ];
    await new Promise((r) => setTimeout(r, 900 + Math.random() * 600));
    return variants[Math.floor(Math.random() * variants.length)];
  }

  async function send() {
    const text = input.trim();
    if (!text || isTyping) return;

    // cancelar requests anteriores
    try {
      inflightRef.current?.abort();
    } catch {}
    inflightRef.current = null;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      time: Date.now(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setIsTyping(true);

    try {
      const reply = await getAssistantReply(text);
      const botMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: reply,
        time: Date.now(),
      };
      setMessages((m) => [...m, botMsg]);
    } catch {
      const errMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content:
          "Ups, no pude responder ahora. Verificá conexión / API y probá de nuevo en unos segundos.",
        time: Date.now(),
      };
      setMessages((m) => [...m, errMsg]);
    } finally {
      setIsTyping(false);
      inflightRef.current = null;
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const isComposing = (e.nativeEvent as any).isComposing;
    if (isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function copy(text: string) {
    const fallback = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {}
    };
    try {
      (navigator as any).clipboard?.writeText?.(text).catch(fallback);
    } catch {
      fallback();
    }
  }

  const quickChips = useMemo(
    () => [
      "Checklist de visa de turista (EEUU)",
      "¿Soy elegible para visa de estudiante?",
      "Costos y tiempos consulares aproximados",
      "Guíame con DS-160 paso a paso",
    ],
    []
  );

  return (
    <div className={`cs-root ${theme}`}>
      <style>{css}</style>

      {/* Sidebar */}
      <aside className="cs-sidebar" aria-label="Historial y ajustes">
        <div className="cs-logo">🛂 ChatMig</div>
        <button className="cs-new" onClick={() => setMessages((m) => m.slice(0, 1))}>
          + Nueva conversación
        </button>
        <div className="cs-history">
          <div className="cs-h-item">Visa turista: checklist</div>
          <div className="cs-h-item">DS-160: dudas</div>
          <div className="cs-h-item">Citas consulado</div>
        </div>
        <div className="cs-footer">
          <button
            className="cs-theme"
            onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "🌙" : "☀️"} Tema
          </button>
          <div className="cs-small">v1.1 – UI</div>
        </div>
      </aside>

      {/* Main chat */}
      <main className="cs-main" role="main">
        <header className="cs-topbar">
          <div className="cs-title">Chat estilo ChatGPT — glow up visual</div>
          <div className="cs-model" aria-label="Modelo activo">
            <span className="dot" /> ChatMig-Agent
          </div>
        </header>

        {/* Mensajes */}
        <div className="cs-list" ref={listRef} role="log" aria-live="polite">
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} onCopy={copy} />
          ))}
          {isTyping && <TypingBubble />}
        </div>

        {/* Chips */}
        <div className="cs-chips" aria-label="Sugerencias rápidas">
          {quickChips.map((c) => (
            <button
              key={c}
              className="cs-chip"
              onClick={() => setInput((s) => (s ? s + "\n" + c : c))}
            >
              {c}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="cs-input">
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Escribí tu mensaje… (Enter para enviar, Shift+Enter para salto)"
            aria-label="Mensaje para ChatMig"
          />
          <button
            className="cs-send"
            onClick={send}
            disabled={!input.trim() || isTyping}
            aria-disabled={!input.trim() || isTyping}
            title="Enviar (Enter)"
          >
            {isTyping ? "…" : "Enviar"}
          </button>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({
  msg,
  onCopy,
}: {
  msg: ChatMessage;
  onCopy: (t: string) => void;
}) {
  const isUser = msg.role === "user";
  return (
    <div
      className={`cs-msg ${isUser ? "user" : "assistant"}`}
      role="article"
      aria-label={isUser ? "Mensaje del usuario" : "Respuesta del asistente"}
    >
      <div className="cs-avatar" aria-hidden="true">
        {isUser ? "🧑" : "🤖"}
      </div>
      <div className="cs-bubble">
        <div className="cs-content">{renderContent(msg.content)}</div>
        <div className="cs-meta">
          <span>
            {isUser ? "Tú" : "ChatMig"} · {fmtTime(msg.time)}
          </span>
          <button className="cs-copy" onClick={() => onCopy(msg.content)}>
            Copiar
          </button>
        </div>
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="cs-msg assistant" aria-live="polite">
      <div className="cs-avatar">🤖</div>
      <div className="cs-bubble typing">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
      </div>
    </div>
  );
}

/** Render minimal de “markdown” (negritas, listas y bloques de código) */
function renderContent(text: string) {
  // Partir por bloques ```code```
  const codeRe = /```([\s\S]*?)```/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = codeRe.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before.trim()) parts.push(<RichText key={`t${last}`} text={before} />);
    const codeInner = (m[1] ?? "").trimEnd();
    parts.push(
      <pre key={`c${m.index}`} className="cs-code">
        <code>{codeInner}</code>
      </pre>
    );
    last = m.index + m[0].length;
  }
  const tail = text.slice(last);
  if (tail.trim()) parts.push(<RichText key={`t${last}-tail`} text={tail} />);

  return <>{parts}</>;
}

function RichText({ text }: { text: string }) {
  // **bold**
  const bolded = text.split(/(\*\*[^*]+?\*\*)/g).map((seg, i) =>
    seg.startsWith("**") && seg.endsWith("**") ? (
      <strong key={i}>{seg.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{seg}</React.Fragment>
    )
  );

  // líneas + bullets/ordenadas simples
  const lines = bolded.flatMap((node, idx) => {
    if (typeof node !== "string") return [node];
    return node.split("\n").map((ln, j, arr) => {
      const om = /^\s*(\d+)[\.\)]\s+(.+)$/.exec(ln);
      const bm = /^\s*[-•]\s+(.+)$/.exec(ln);
      if (om) {
        return (
          <div key={`${idx}-${j}`} style={{ display: "flex", gap: 8 }}>
            <span style={{ minWidth: 22, textAlign: "right", fontWeight: 800 }}>
              {om[1]}.
            </span>
            <span>{om[2]}</span>
          </div>
        );
      }
      if (bm) {
        return (
          <div key={`${idx}-${j}`} style={{ display: "flex", gap: 8 }}>
            <span>•</span>
            <span>{bm[1]}</span>
          </div>
        );
      }
      return (
        <span key={`${idx}-${j}`}>
          {ln}
          {j < arr.length - 1 && <br />}
        </span>
      );
    });
  });

  return <>{lines}</>;
}

/* ============================== estilos ============================== */
const css = `
:root{ --bg:#0b0d11; --panel:#11131a; --sub:#a8b3cf; --text:#eef2ff; --acc:#6ee7b7; --line:#1b1f2a }
.light{ --bg:#f7f8fb; --panel:#ffffff; --sub:#4b5563; --text:#0b1220; --acc:#0891b2; --line:#e5e7eb }

.cs-root{ display:flex; height:100vh; background:
  radial-gradient(1000px 500px at 10% -10%, #1a2540, transparent),
  radial-gradient(800px 400px at 90% 10%, #11301f, transparent),
  var(--bg);
  color:var(--text); font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto
}
.cs-sidebar{ width:260px; border-right:1px solid var(--line); padding:16px; display:flex; flex-direction:column; gap:12px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.05)), var(--panel)
}
.cs-logo{ font-weight:800; letter-spacing:.3px; font-size:18px }
.cs-new{ background:var(--acc); color:#042; border:0; padding:10px 12px; border-radius:12px; font-weight:700; cursor:pointer }
.cs-history{ display:flex; flex-direction:column; gap:8px; margin-top:6px }
.cs-h-item{ padding:10px 12px; border:1px solid var(--line); border-radius:12px; opacity:.9; cursor:pointer }
.cs-h-item:hover{ background: rgba(255,255,255,.04) }
.cs-footer{ margin-top:auto; display:flex; flex-direction:column; gap:8px }
.cs-theme{ background:transparent; color:var(--text); border:1px solid var(--line); border-radius:10px; padding:8px 10px; cursor:pointer }
.cs-small{ font-size:12px; color:var(--sub) }

.cs-main{ flex:1; display:flex; flex-direction:column; height:100% }
.cs-topbar{ height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; border-bottom:1px solid var(--line);
  backdrop-filter: blur(6px); background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.06))
}
.cs-title{ font-weight:700 }
.cs-model{ display:flex; align-items:center; gap:8px; color:var(--sub) }
.cs-model .dot{ width:10px; height:10px; border-radius:999px; background:radial-gradient(circle at 30% 30%, #8bffda, #33cc99) }

.cs-list{ flex:1; overflow:auto; padding:22px 18px; display:flex; flex-direction:column; gap:16px }
.cs-msg{ display:flex; align-items:flex-start; gap:12px; max-width:920px }
.cs-msg.user{ align-self:flex-end }
.cs-avatar{ width:36px; height:36px; display:grid; place-items:center; border-radius:10px; background:#0f1524; border:1px solid var(--line) }
.cs-msg.user .cs-avatar{ background:#18241b }

.cs-bubble{
  position:relative; padding:14px 16px; border-radius:16px; border:1px solid var(--line);
  box-shadow: 0 6px 24px rgba(0,0,0,.2);
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.12))
}
.cs-msg.assistant .cs-bubble{
  background:
    radial-gradient(600px 200px at 0% 0%, rgba(51,204,153,.18), transparent),
    radial-gradient(600px 200px at 100% 0%, rgba(98,114,255,.12), transparent),
    linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.12))
}
.cs-msg.user .cs-bubble{ background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.06)) }
.cs-content{ white-space:pre-wrap; line-height:1.45 }
.cs-meta{ display:flex; gap:12px; align-items:center; font-size:12px; color:var(--sub); margin-top:8px }
.cs-copy{ margin-left:auto; background:transparent; color:var(--sub); border:1px solid var(--line); border-radius:8px; padding:4px 8px; cursor:pointer }
.cs-copy:hover{ color:var(--text) }

.cs-code{ background:#0b0d14; border:1px solid var(--line); padding:12px; border-radius:12px; overflow:auto; margin-top:8px }

.typing{ display:inline-flex; gap:6px; align-items:center; min-width:60px }
.typing .dot{ width:8px; height:8px; border-radius:999px; background:#a5b4fc; animation:bop 1.1s infinite }
.typing .dot:nth-child(2){ animation-delay:.15s }
.typing .dot:nth-child(3){ animation-delay:.3s }
@keyframes bop{ 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-4px) } }

.cs-chips{ display:flex; flex-wrap:wrap; gap:8px; padding:0 18px 10px }
.cs-chip{ background:transparent; color:var(--text); border:1px dashed var(--line); border-radius:999px; padding:6px 10px; cursor:pointer }
.cs-chip:hover{ background: rgba(255,255,255,.06) }

.cs-input{
  display:flex; gap:10px; padding:12px 18px 18px; border-top:1px solid var(--line);
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.08)); backdrop-filter: blur(8px)
}
.cs-input textarea{
  flex:1; resize:none; max-height:160px; min-height:52px; padding:12px 14px;
  border-radius:14px; border:1px solid var(--line); background: rgba(255,255,255,.02); color:var(--text); outline:none
}
.cs-send{
  background: var(--acc); color:#052; border:0; border-radius:12px; padding:0 16px; font-weight:800; min-width:96px; cursor:pointer
}
.cs-send:disabled{ opacity:.6; cursor:not-allowed }

@media (max-width:980px){ .cs-sidebar{ display:none } }
`;
