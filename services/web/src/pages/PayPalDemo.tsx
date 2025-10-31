import { useState } from "react";
import PayPalWidget from "../components/PayPalWidget";

export default function PayPalDemo() {
  const [done, setDone] = useState<any>(null);

  return (
    <div style={{ padding: 20, color: "#eaf2ff", fontFamily: "system-ui" }}>
      <h2>Demo PayPal</h2>

      <h3>Pago único</h3>
      <PayPalWidget
        mode="oneTime"
        amount="1.00"
        currency="USD"
        onDone={(d) => setDone(d)}
      />

      <div style={{ height: 28 }} />

      <h3>Suscripción (plan_id requerido)</h3>
      {/* Reemplaza por el plan_id que te devuelva tu backend o que ya tengas en PayPal */}
      <PayPalWidget
        mode="subscription"
        planId={import.meta.env.VITE_PAYPAL_PLAN_ID as string}
        onDone={(d) => setDone(d)}
      />

      <pre style={{ background: "#0b1220", padding: 12, borderRadius: 10, marginTop: 16 }}>
        {JSON.stringify(done, null, 2)}
      </pre>
    </div>
  );
}

