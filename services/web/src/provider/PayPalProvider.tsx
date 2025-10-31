// src/providers/PayPalProvider.tsx
import React from "react";
import { PayPalScriptProvider, ReactPayPalScriptOptions } from "@paypal/react-paypal-js";

type Props = { children: React.ReactNode };

export default function PayPalProvider({ children }: Props) {
  const options: ReactPayPalScriptOptions = {
    "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID!,
    intent: import.meta.env.VITE_PAYPAL_INTENT || "subscription",
    vault: (import.meta.env.VITE_PAYPAL_VAULT ?? "true") === "true",
    currency: import.meta.env.VITE_PAYPAL_CURRENCY || "USD",
    components: import.meta.env.VITE_PAYPAL_COMPONENTS || "buttons",
    "enable-funding": import.meta.env.VITE_PAYPAL_ENABLE_FUNDING,
    "disable-funding": import.meta.env.VITE_PAYPAL_DISABLE_FUNDING,
    ...(import.meta.env.VITE_PAYPAL_MERCHANT_ID
      ? { "merchant-id": import.meta.env.VITE_PAYPAL_MERCHANT_ID }
      : {}),
  };

  return <PayPalScriptProvider options={options}>{children}</PayPalScriptProvider>;
}

