/// <reference types="vite/client" />

import React, { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { PayPalScriptProvider, ReactPayPalScriptOptions } from "@paypal/react-paypal-js";

// CSS globales
import "./index.css";
import "./styles/layout.css";
import "./styles/select.css";
import "./styles/right-panel.css";
import "./styles/voice-agent.css";

// Carga perezosa de la App para mejorar TTI
const App = React.lazy(() => import("./App"));

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el contenedor #root");

const root = createRoot(container);

// StrictMode solo en DEV (evita dobles efectos en prod)
const Wrapper: React.ComponentType<{ children: React.ReactNode }> =
  import.meta.env.DEV ? React.StrictMode : React.Fragment;

const paypalOptions: ReactPayPalScriptOptions = {
  "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID!, // NO pongas el secret en el front
  currency: import.meta.env.VITE_PAYPAL_CURRENCY || "USD",
  intent: (import.meta.env.VITE_PAYPAL_INTENT as any) || "subscription",
  vault: (import.meta.env.VITE_PAYPAL_VAULT ?? "true") === "true",
  components: import.meta.env.VITE_PAYPAL_COMPONENTS || "buttons",
  "enable-funding": import.meta.env.VITE_PAYPAL_ENABLE_FUNDING,
  "disable-funding": import.meta.env.VITE_PAYPAL_DISABLE_FUNDING,
  // Opcional: commit/debug si los usas en tu .env (no siempre tipados en TS)
  ...(import.meta.env.VITE_PAYPAL_COMMIT
    ? { commit: (import.meta.env.VITE_PAYPAL_COMMIT ?? "true") === "true" }
    : {}),
};

root.render(
  <Wrapper>
    <Suspense
      fallback={
        <div
          id="boot-splash"
          style={{
            display: "grid",
            placeItems: "center",
            height: "100vh",
            color: "#eaf2ff",
            background: "#081019",
          }}
        >
          <div style={{ opacity: 0.9, fontWeight: 900, letterSpacing: 0.3 }}>
            Cargando ChatMig…
          </div>
        </div>
      }
    >
      <PayPalScriptProvider options={paypalOptions}>
        <App />
      </PayPalScriptProvider>
    </Suspense>
  </Wrapper>
);

