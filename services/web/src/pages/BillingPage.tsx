import React from "react";
import BillingPanel from "../components/BillingPanel";

export default function BillingPage() {
  // Pasa el identificador que uses en tus tablas (user_id o email)
  return (
    <div style={{ padding: 16 }}>
      <BillingPanel email="istemcalid07@gmail.com" />
    </div>
  );
}

