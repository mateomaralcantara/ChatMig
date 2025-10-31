// Pequeño bus de eventos + API pública del agente de voz
export type VoiceAgentEvent =
  | { type: "show"; payload: { text?: string; lang?: string; title?: string; avatarUrl?: string } }
  | { type: "update"; payload: { text?: string } }
  | { type: "hide" }
  | { type: "state"; payload: { speaking?: boolean; paused?: boolean } };

type Listener = (e: VoiceAgentEvent) => void;

class VoiceAgentBus {
  private listeners = new Set<Listener>();
  on(fn: Listener) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(e: VoiceAgentEvent) { this.listeners.forEach(fn => { try { fn(e); } catch {} }); }
}
const bus = new VoiceAgentBus();

export const voiceAgent = {
  show(text?: string, opts?: { lang?: string; title?: string; avatarUrl?: string }) {
    bus.emit({ type: "show", payload: { text, ...opts } });
    bus.emit({ type: "state", payload: { speaking: true, paused: false } });
  },
  update(text?: string) { bus.emit({ type: "update", payload: { text } }); },
  hide() { bus.emit({ type: "hide" }); },
  state(speaking: boolean, paused: boolean) {
    bus.emit({ type: "state", payload: { speaking, paused } });
  },
  _bus: bus, // para el componente React
};

