// web/src/hooks/useVoice.ts
export type UseVoice = {
    supported: boolean;
    listening: boolean;
    start: (onFinal: (text: string) => void) => void;
    stop: () => void;
    speak: (text: string, opts?: { lang?: string; rate?: number; pitch?: number }) => void;
    cancelSpeak: () => void;
  };
  
  export function useVoice(lang: string = "es-ES"): UseVoice {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const supported = Boolean(SpeechRecognition) && typeof window.speechSynthesis !== "undefined";
  
    let recognition: any = null;
    let listening = false;
  
    const start = (onFinal: (text: string) => void) => {
      if (!supported) return;
      if (listening) return;
  
      recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;
      listening = true;
  
      let finalText = "";
  
      recognition.onresult = (ev: any) => {
        let transcript = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          transcript += ev.results[i][0].transcript || "";
          if (ev.results[i].isFinal) finalText = transcript;
        }
        // Puedes mostrar parciales en UI si quieres: transcript
      };
  
      recognition.onerror = () => {
        listening = false;
        try { recognition.stop(); } catch {}
      };
  
      recognition.onend = () => {
        listening = false;
        if (finalText.trim()) onFinal(finalText.trim());
      };
  
      try {
        recognition.start();
      } catch {
        // algunos navegadores lanzan si ya estaba corriendo
      }
    };
  
    const stop = () => {
      if (!supported) return;
      try { recognition?.stop(); } catch {}
      listening = false;
    };
  
    // ---- TTS ----
    const speak = (text: string, opts?: { lang?: string; rate?: number; pitch?: number }) => {
      if (!supported || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = opts?.lang || lang;
      u.rate = opts?.rate ?? 1;
      u.pitch = opts?.pitch ?? 1;
  
      // Intentar elegir una voz española si existe
      const voices = window.speechSynthesis.getVoices();
      const es = voices.find(v => /^es(-|_)?/i.test(v.lang)) || voices[0];
      if (es) u.voice = es;
  
      window.speechSynthesis.cancel(); // evita solapamientos
      window.speechSynthesis.speak(u);
    };
  
    const cancelSpeak = () => {
      if (!supported) return;
      window.speechSynthesis.cancel();
    };
  
    return { supported, listening, start, stop, speak, cancelSpeak };
  }
  
