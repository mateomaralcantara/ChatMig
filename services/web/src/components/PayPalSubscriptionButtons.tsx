// src/components/PayPalSubscribeButton.tsx
import React from "react";
import { PayPalButtons } from "@paypal/react-paypal-js";

export default function PayPalSubscriptionButtons({
  tier = "pro",
  onApproved,
}: {
  tier?: "pro" | "premium";
  onApproved?: (subscriptionID: string) => void;
}) {
  return (
    <PayPalButtons
      style={{ layout: "vertical", color: "gold", shape: "rect", label: "paypal" }}
      createSubscription={async () => {
        const r = await fetch("/api/paypal/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(data.error || data));
        return data.id; // <-- PayPal espera el ID aquí
      }}
      onApprove={(data) => data.subscriptionID && onApproved?.(data.subscriptionID)}
      onError={(err) => {
        console.error(err);
        alert("Error PayPal: " + (err?.message || String(err)));
      }}
    />
  );
}

