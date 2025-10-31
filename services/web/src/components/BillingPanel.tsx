import React, { useEffect, useMemo, useState } from "react";

type Payment = {
  id: string;
  created_at: string;
  status: string;
  amount: number;
  currency: string;
  order_id?: string;
  payer_email?: string;
};

type Subscription = {
  provider: string;
  subscription_id: string;
  plan_id?: string;
  status: string;
  start_time?: string;
  next_billing_time?: string;
};

type SummaryResponse = {
  subscription: Subscription | null;
  payments: Payment[];
};

type Props = {
  userId?: string;
  email?: string;
};

export default function BillingPanel({ userId, email }: Props) {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (userId) p.set("user_id", userId);
    if (email) p.set("email", email);
    return p.toString();
  }, [userId, email]);

  const load = async () => {
    if (!qs) {
      setErr("Falta userId o email para consultar el resumen.");
      return;
    }
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/paypal/summary?${qs}`, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SummaryResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message || "Error cargando resumen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qs]);

  const sub = data?.subscription ?? null;
  const pays = data?.payments ?? [];

  return (
    <div style={cardStyle}>
      <h2 style={{ margin: 0 }}>Facturación / Membresía</h2>
      <p style={{ marginTop: 6, color: "#94a3b8" }}>
        Estado guardado por el webhook de PayPal.
      </p>

      <div style={row}>
        <button onClick={load} disabled={loading} style={btn}>
          {loading ? "Actualizando..." : "Refrescar"}
        </button>
      </div>

      {err && <div style={errBox}>⚠ {err}</div>}

      <section style={section}>
        <h3 style={h3}>Membresía</h3>
        {!sub ? (
          <div style={{ color: "#94a3b8" }}>Sin suscripción activa.</div>
        ) : (
          <div style={grid}>
            <Field k="Proveedor" v={sub.provider} />
            <Field k="Subscription ID" v={sub.subscription_id} mono />
            <Field k="Plan" v={sub.plan_id || "—"} mono />
            <Field k="Estado" v={sub.status} strong />
            <Field k="Inicio" v={fmt(sub.start_time)} />
            <Field k="Próxima factura" v={fmt(sub.next_billing_time)} />
          </div>
        )}
      </section>

      <section style={section}>
        <h3 style={h3}>Últimos pagos</h3>
        {pays.length === 0 ? (
          <div style={{ color: "#94a3b8" }}>Sin pagos.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Monto</th>
                  <th>Moneda</th>
                  <th>Estado</th>
                  <th>Order ID</th>
                  <th>Payer</th>
                </tr>
              </thead>
              <tbody>
                {pays.map((p) => (
                  <tr key={p.id}>
                    <td>{fmt(p.created_at)}</td>
                    <td>{p.amount.toFixed(2)}</td>
                    <td>{p.currency}</td>
                    <td>{p.status}</td>
                    <td style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{p.order_id || "—"}</td>
                    <td>{p.payer_email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 8 }}>
      <div style={{ color: "#94a3b8" }}>{k}</div>
      <div style={{ fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined, fontWeight: strong ? 800 : 500 }}>
        {v}
      </div>
    </div>
  );
}

function fmt(s?: string) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleString();
  } catch {
    return s;
  }
}

/* —— estilos inline mínimos —— */
const cardStyle: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1f2937",
  color: "#e5e7eb",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(0,0,0,.35)",
};
const row: React.CSSProperties = { display: "flex", gap: 8, alignItems: "center", marginTop: 8 };
const btn: React.CSSProperties = {
  border: "1px solid #1f2937",
  background: "transparent",
  color: "#e5e7eb",
  borderRadius: 10,
  padding: "8px 12px",
  cursor: "pointer",
};
const errBox: React.CSSProperties = {
  marginTop: 10,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(248,113,113,.35)",
  color: "#fecaca",
  background: "rgba(127,29,29,.25)",
};
const section: React.CSSProperties = { marginTop: 16 };
const h3: React.CSSProperties = { margin: "0 0 10px 0" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 };
const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  border: "1px solid #1f2937",
};

