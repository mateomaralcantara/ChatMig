import React, { useEffect, useMemo, useRef, useState } from "react";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import ChatMigUI from "./ChatMigUI";
import AuthPanel from "./components/AuthPanel";
import VoiceAgent from "./components/VoiceAgent";

// ---- PayPal ----
const clientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "sb";
const paypalOptsBase = {
  currency: "USD",
  intent: "subscription" as const,
  vault: true,
};

// ---- Persistencia del panel ----
const STORAGE_KEY = "cm.sidebarOpen";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const initDone = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  // Memoriza options de PayPal para evitar re-renders
  const paypalOptions = useMemo(
    () => ({ "client-id": clientId, ...paypalOptsBase }),
    [clientId]
  );

  // Detecta móvil/escritorio + inicializa estado recordado del panel
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (!initDone.current) {
        const saved = localStorage.getItem(STORAGE_KEY);
        const defaultOpen = mobile ? false : true; // móvil cerrado / desktop abierto
        const open = saved === null ? defaultOpen : saved === "1";
        setSidebarOpen(open);
        initDone.current = true;
      }
    };
    apply();
    if ("addEventListener" in mq) mq.addEventListener("change", apply);
    else (mq as any).addListener?.(apply);
    return () => {
      if ("removeEventListener" in mq) mq.removeEventListener("change", apply);
      else (mq as any).removeListener?.(apply);
    };
  }, []);

  // Cerrar con Escape cuando el drawer está abierto en móvil
  useEffect(() => {
    if (!(isMobile && sidebarOpen)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, sidebarOpen]);

  // Bloquea scroll de la página y maneja el foco al abrir/cerrar
  useEffect(() => {
    const root = document.documentElement;
    if (isMobile && sidebarOpen) {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      root.style.overflow = "hidden";
      requestAnimationFrame(() => panelRef.current?.focus()); // accesibilidad
    } else {
      root.style.overflow = "";
      lastFocusRef.current?.focus?.();
    }
    return () => {
      root.style.overflow = "";
    };
  }, [isMobile, sidebarOpen]);

  const saveOpen = (open: boolean) => {
    localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    setSidebarOpen(open);
  };
  const toggleSidebar = () => saveOpen(!sidebarOpen);
  const closeSidebar = () => saveOpen(false);

  // Si tu ChatMigUI aún no tipa props, esta conversión evita errores TS.
  const ChatMig = ChatMigUI as unknown as React.FC<{
    onToggleSidebar?: () => void;
    sidebarOpen?: boolean;
  }>;

  return (
    <PayPalScriptProvider options={paypalOptions}>
      <div
        className={`layout ${!isMobile && !sidebarOpen ? "hide-sidebar" : ""}`}
        data-mobile={isMobile ? "1" : "0"}
        data-sidebar={sidebarOpen ? "open" : "closed"}
      >
        <main className="content">
          {/* El header de ChatMigUI puede mostrar un botón para abrir/cerrar */}
          <VoiceAgent />   {/* Overlay de voz, oculto hasta que lo llames */}  
          <ChatMig onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />
        </main>

        <aside
          id="right-panel"
          ref={panelRef as any}
          className={`sidebar rp-panel ${isMobile && sidebarOpen ? "open" : ""}`}
          tabIndex={-1}
          aria-label="Panel de cuenta y membresías"
          aria-hidden={isMobile ? (!sidebarOpen).toString() : "false"}
          aria-modal={isMobile && sidebarOpen ? true : undefined}
          role={isMobile ? "dialog" : "complementary"}
          data-state={sidebarOpen ? "open" : "closed"}
        >
          <button className="close" onClick={closeSidebar} aria-label="Cerrar panel">
            ×
          </button>
          <AuthPanel />
        </aside>

        {isMobile && sidebarOpen && (
          <div
            className="backdrop"
            onClick={closeSidebar}
            aria-hidden="true"
            data-state="open"
          />
        )}
      </div>
    </PayPalScriptProvider>
  );
}

