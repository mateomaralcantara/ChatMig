import React, { useMemo, useState } from "react";
import PayPalSubscriptionButtons from "./PayPalSubscriptionButtons";

type Tab = "login" | "signup";

export default function AuthPanel() {
  const [tab, setTab] = useState<Tab>("login");
  const [selectedPlan, setSelectedPlan] = useState<"free" | "pro" | "premium">("free");

  const PLAN_PRO = import.meta.env.VITE_PAYPAL_PLAN_PRO as string | undefined;
  const PLAN_PREMIUM = import.meta.env.VITE_PAYPAL_PLAN_PREMIUM as string | undefined;

  const planInfo = useMemo(() => {
    if (selectedPlan === "pro")     return { label: "Pro", price: 20, planId: PLAN_PRO };
    if (selectedPlan === "premium") return { label: "Premium", price: 50, planId: PLAN_PREMIUM };
    return { label: "Free", price: 0, planId: undefined };
  }, [selectedPlan, PLAN_PRO, PLAN_PREMIUM]);

  return (
    <div className="rp-scroll rp-fade-in">
      {/* Header */}
      <header className="rp-header">
        <div className="rp-title">👤 Cuenta</div>
        <div className="rp-sub">Accede, crea tu cuenta y elige una membresía</div>

        {/* Tabs */}
        <div className="rp-tabs" role="tablist" aria-label="Secciones de cuenta">
          <button
            className={`rp-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => setTab("login")}
            role="tab"
            aria-selected={tab === "login"}
          >
            Iniciar sesión
          </button>
          <button
            className={`rp-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => setTab("signup")}
            role="tab"
            aria-selected={tab === "signup"}
          >
            Crear cuenta
          </button>
        </div>
      </header>

      {/* Sección auth */}
      <section className="rp-section" aria-live="polite">
        {tab === "login" ? <LoginForm /> : <SignupForm />}
      </section>

      <div className="rp-divider">Membresías</div>

      {/* Pricing / Membresías */}
      <section className="rp-section">
        <div className="rp-pricing" role="radiogroup" aria-label="Planes">
          <label className={`rp-plan ${selectedPlan === "free" ? "pro" : ""}`}>
            <input
              type="radio"
              name="plan"
              checked={selectedPlan === "free"}
              onChange={() => setSelectedPlan("free")}
              hidden
            />
            <div className="rp-plan-head">
              <span className="rp-badge pro">Free</span>
              <span className="rp-price">$0</span>
            </div>
            <ul className="rp-feats">
              <li>Uso personal básico</li>
              <li>Soporte comunitario</li>
            </ul>
          </label>

          <label className={`rp-plan pro ${selectedPlan === "pro" ? "glow" : ""}`}>
            <input
              type="radio"
              name="plan"
              checked={selectedPlan === "pro"}
              onChange={() => setSelectedPlan("pro")}
              hidden
            />
            <div className="rp-plan-head">
              <span className="rp-badge pro">Pro</span>
              <span className="rp-price">$20</span>
            </div>
            <ul className="rp-feats">
              <li>Más tokens / mes</li>
              <li>Asistencia prioritaria</li>
            </ul>
          </label>

          <label className={`rp-plan premium ${selectedPlan === "premium" ? "glow" : ""}`}>
            <input
              type="radio"
              name="plan"
              checked={selectedPlan === "premium"}
              onChange={() => setSelectedPlan("premium")}
              hidden
            />
            <div className="rp-plan-head">
              <span className="rp-badge premium">Premium</span>
              <span className="rp-price">$50</span>
            </div>
            <ul className="rp-feats">
              <li>Prioridad máxima</li>
              <li>Herramientas avanzadas</li>
            </ul>
          </label>
        </div>

        <div className="rp-card" style={{ marginTop: 10 }}>
          {planInfo.price === 0 ? (
            <button
              className="rp-btn success block"
              onClick={() => alert("Plan Free activado")}
            >
              Continuar con Free
            </button>
          ) : planInfo.planId ? (
            <div className="rp-list">
              <p className="rp-muted">
                Suscripción <strong>{planInfo.label}</strong> – {planInfo.price} USD/mes
              </p>
              <PayPalSubscriptionButtons
                planId={planInfo.planId}
                onApproved={(subscriptionID) => {
                  // TODO: enviar al backend para activar beneficios
                  // fetch("/api/billing/attach", {method:"POST", headers:{'Content-Type':'application/json'}, body: JSON.stringify({provider:"paypal", subscriptionID})})
                  alert("Suscripción creada: " + subscriptionID);
                }}
              />
            </div>
          ) : (
            <p className="rp-alert warn">
              Falta configurar el <strong>PLAN_ID</strong> en .env para {planInfo.label}.
            </p>
          )}
        </div>
      </section>

      <p className="rp-legal">Al continuar aceptas términos y privacidad.</p>
    </div>
  );
}

function LoginForm() {
  return (
    <div className="rp-card headed" role="region" aria-label="Formulario de acceso">
      <div className="rp-card-title">Iniciar sesión</div>
      <form
        className="rp-form"
        onSubmit={(e) => {
          e.preventDefault();
          alert("Login demo");
        }}
      >
        <div className="rp-row">
          <label>Email</label>
          <input className="rp-input" placeholder="tucorreo@dominio.com" type="email" required />
        </div>
        <div className="rp-row">
          <label>Contraseña</label>
          <input className="rp-input" placeholder="••••••••" type="password" required />
        </div>
        <div className="rp-actions">
          <button className="rp-btn primary">Entrar</button>
          <button className="rp-btn ghost" type="button">¿Olvidaste tu contraseña?</button>
        </div>
      </form>
    </div>
  );
}

function SignupForm() {
  return (
    <div className="rp-card headed" role="region" aria-label="Formulario de alta">
      <div className="rp-card-title">Crear cuenta</div>
      <form
        className="rp-form"
        onSubmit={(e) => {
          e.preventDefault();
          alert("Cuenta creada (demo)");
        }}
      >
        <div className="rp-row inline">
          <div>
            <label>Nombre</label>
            <input className="rp-input" placeholder="Tu nombre" required />
          </div>
          <div>
            <label>Apellido</label>
            <input className="rp-input" placeholder="Tu apellido" required />
          </div>
        </div>
        <div className="rp-row">
          <label>Email</label>
          <input className="rp-input" placeholder="tucorreo@dominio.com" type="email" required />
        </div>
        <div className="rp-row">
          <label>Contraseña</label>
          <input className="rp-input" placeholder="Mínimo 8 caracteres" type="password" required />
        </div>
        <div className="rp-actions">
          <button className="rp-btn success">Crear cuenta</button>
        </div>
      </form>
    </div>
  );
}

