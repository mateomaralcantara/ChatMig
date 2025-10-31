import { useEffect, useRef, useState } from "react";

// Lee tus VITE_*
const CLIENT_ID   = import.meta.env.VITE_PAYPAL_CLIENT_ID as string;
const CURRENCY    = (import.meta.env.VITE_PAYPAL_CURRENCY as string) || "USD";
// Para órdenes: intent=capture | authorize ; Para suscripciones: intent=subscription + vault=true
type Mode = "oneTime" | "subscription";

type Props = {
  mode: Mode;
  amount?: string;           // solo oneTime (ej: "5.00")
  currency?: string;         // por defecto VITE o "USD"
  planId?: string;           // requerido en subscription (plan ya creado en backend o PayPal)
  onDone?: (payload: any) => void;
};

declare global {
  interface Window {
    paypal?: any;
  }
}

function loadScriptOnce(src: string, id = "paypal-sdk"): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      // Si ya existe con mismo src, resuelve; si no, lo reemplaza.
      if (existing.src === src) return resolve();
      existing.remove();
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("No se pudo cargar PayPal SDK"));
    document.head.appendChild(s);
  });
}

export default function PayPalWidget({
  mode,
  amount = "1.00",
  currency = CURRENCY || "USD",
  planId,
  onDone,
}: Props) {

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setErr(null);
    if (!CLIENT_ID) {
      setErr("Falta VITE_PAYPAL_CLIENT_ID");
      return;
    }

    // Query de SDK según modo
    // Órdenes:
    //   components=buttons&intent=capture (o authorize)
    // Suscripciones:
    //   components=buttons&intent=subscription&vault=true
    const params =
      mode === "subscription"
        ? `components=buttons&intent=subscription&vault=true`
        : `components=buttons&intent=capture&currency=${encodeURIComponent(currency)}`;

    const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(
      CLIENT_ID
    )}&${params}`;

    loadScriptOnce(sdkUrl)
      .then(() => setReady(true))
      .catch((e) => setErr(e?.message || String(e)));
  }, [mode, currency]);

  useEffect(() => {
    if (!ready || !window.paypal || !containerRef.current) return;
    containerRef.current.innerHTML = ""; // limpia por si re-renderiza

    const btns = window.paypal.Buttons(
      mode === "oneTime"
        ? {
            style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },

            // === createOrder en tu BACKEND ===
            createOrder: async () => {
              const res = await fetch("/api/paypal/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, currency, intent: "capture" }),
              });
              if (!res.ok) throw new Error("createOrder fallo");
              const data = await res.json();
              return data.id;
            },

            // === captura en tu BACKEND ===
            onApprove: async (data: any) => {
              const res = await fetch("/api/paypal/capture", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderID: data.orderID }),
              });
              const details = await res.json();
              onDone?.(details);
              alert("Pago confirmado en servidor: " + (details?.id || data.orderID));
            },

            onError: (e: any) => {
              console.error(e);
              setErr(e?.message || "Error PayPal");
            },
          }
        : {
            style: { layout: "vertical", color: "gold", shape: "rect", label: "subscribe" },

            // === Suscripción client-side: necesita planId ===
            // (Luego avisamos al backend para guardar/verificar)
            createSubscription: (_: any, actions: any) => {
              if (!planId) throw new Error("Falta planId");
              return actions.subscription.create({ plan_id: planId });
            },

            onApprove: async (data: any) => {
              try {
                // Verifica/guarda en backend
                const res = await fetch("/api/paypal/subscriptions/verify", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ subscriptionID: data.subscriptionID }),
                });
                const info = await res.json();
                onDone?.(info);
                alert("Suscripción creada: " + data.subscriptionID);
              } catch (e: any) {
                console.error(e);
                alert("Suscripción creada, pero no se pudo verificar en backend.");
              }
            },

            onError: (e: any) => {
              console.error(e);
              setErr(e?.message || "Error PayPal");
            },
          }
    );

    btns.render(containerRef.current);

    return () => {
      try { btns.close?.(); } catch {}
    };
  }, [ready, mode, amount, currency, planId, onDone]);

  return (
    <div>
      {err && <div style={{ color: "#ef4444", marginBottom: 8 }}>⚠ {err}</div>}
      <div ref={containerRef} />
    </div>
  );
}

