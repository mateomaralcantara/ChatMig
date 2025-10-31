import React, { useEffect, useMemo, useState } from "react";
import { voiceAgent } from "../lib/voice-agent";

type Props = {
  avatar?: string;     // por defecto /agent.png (carpeta public)
  dock?: "br" | "bl" | "tr" | "tl";
  maxChars?: number;   // recorta texto mostrado
};

export default function VoiceAgent({ avatar = "/agent.png", dock = "br", maxChars = 280 }: Props) {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [text, setText] = useState<string>("");
  const [lang, setLang] = useState<string>("es-ES");
  const [title, setTitle] = useState<string>("Hablando…");

  // Suscripción al bus
  useEffect(() => {
    return voiceAgent._bus.on((e) => {
      if (e.type === "show") {
        setOpen(true);
        setText((e.payload.text || "").slice(0, maxChars));
        setLang(e.payload.lang || "es-ES");
        setTitle(e.payload.title || "Hablando…");
      } else if (e.type === "update") {
        setText((e.payload.text || "").slice(0, maxChars));
      } else if (e.type === "hide") {
        setOpen(false);
        setPaused(false);
        setText("");
      } else if (e.type === "state") {
        if (typeof e.payload.paused === "boolean") setPaused(e.payload.paused);
      }
    });
  }, [maxChars]);

  // Controles del sintetizador
  const canTTS = typeof window !== "undefined" && "speechSynthesis" in window;
  const tts = useMemo(() => (canTTS ? window.speechSynthesis : null), [canTTS]);

  const onPause = () => { try { tts?.pause(); } catch {} ; setPaused(true); };
  const onResume = () => { try { tts?.resume(); } catch {} ; setPaused(false); };
  const onStop = () => { try { tts?.cancel(); } catch {} ; voiceAgent.hide(); };

  return (
    <div
      className={`va-overlay ${open ? "open" : ""} dock-${dock}`}
      aria-hidden={!open}
      role="dialog"
      aria-label="Agente de voz"
    >
      <div className="va-card">
        <div className="va-left">
          <div className={`va-avatar ${paused ? "paused" : "speaking"}`}>
            <img src={avatar} alt="Agente" />
            <span className="va-ring" />
            <span className="va-ring va-ring2" />
          </div>
        </div>

        <div className="va-main">
          <div className="va-title">
            <span>{title}</span>
            <span className="va-lang">{lang}</span>
          </div>
          <div className="va-text" aria-live="polite">
            {text || "Preparando voz…"}
          </div>

          <div className="va-actions">
            <button className="va-btn" onClick={paused ? onResume : onPause}>
              {paused ? "▶ Reanudar" : "⏸ Pausar"}
            </button>
            <button className="va-btn danger" onClick={onStop}>⏹ Detener</button>
          </div>
        </div>
      </div>
    </div>
  );
}

