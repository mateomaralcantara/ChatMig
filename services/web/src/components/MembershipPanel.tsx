// web/src/components/MembershipPanel.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type PlanId = "free" | "pro" | "premium";
type TabId = "login" | "signup";

export interface MembershipPanelProps {
  isOpen: boolean;
  onClose: () => void;

  // Branding / defaults
  brandName?: string;
  brandEmoji?: string;
  initialTab?: TabId;
  initialPlan?: PlanId;

  // Callbacks (si no pasas, uso stubs con alert)
  onLogin?: (email: string, password: string) => void;
  onSignup?: (email: string, password: string) => void;
  onCheckout?: (plan: PlanId) => void;

  // Render prop: si quieres poner TU botón PayPal embebido aquí (opcional)
  // Ej: (planIdPaypal, planIdUi) => <PayPalSubscriptionButtons ... />
  renderPayButton?: (paypalPlanId: string, planId: PlanId) => React.ReactNode;

  // Theming por CSS vars
  themeVars?: Partial<{
    bg: string; panel: string; text: string; sub: string; line: string; acc: string; acc2: string;
  }>;
}

// ---------- ENV ----------
const SUCCESS_URL = import.meta.env.VITE_SUCCESS_URL as string | undefined;
const CANCEL_URL  = import.meta.env.VITE_CANCEL_URL  as string | undefined;
const P_PRO       = import.meta.env.VITE_PAYPAL_PLAN_PRO as string | undefined;      // P-XXXX
const P_PREMIUM   = import.meta.env.VITE_PAYPAL_PLAN_PREMIUM as string | undefined;  // P-YYYY

const styles = `
:root {
  --mp-bg: rgba(0,0,0,.55);
  --mp-panel: #0f172a;
  --mp-text: #eaf2ff;
  --mp-sub: #cbd5e1;
  --mp-line: #1f2937;
  --mp-acc: #3b82f6;
  --mp-acc2: #ef4444;
}

/* Overlay (click outside) */
.mp-overlay {
  position: fixed; inset: 0; background: var(--mp-bg);
  z-index: 1000; opacity: 0; animation: mp-fade .18s ease forwards;
}
@keyframes mp-fade { to { opacity: 1 } }

/* Panel (drawer right) */
.mp-panel {
  position: fixed; inset-block:0; inset-inline-end:0; inline-size: 420px; max-inline-size: 92vw;
  background: linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.14)), var(--mp-panel);
  color: var(--mp-text);
  border-inline-start: 1px solid var(--mp-line);
  box-shadow: -16px 0 48px rgba(2,6,23,.55);
  transform: translateX(100%);
  animation: mp-slide-in .28s ease forwards;
  display:flex; flex-direction:column;
}
@keyframes mp-slide-in { to { transform: translateX(0) } }
@media (prefers-reduced-motion: reduce){
  .mp-overlay, .mp-panel { animation: none; opacity: 1; transform: none; }
}

.mp-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:12px 14px; border-block-end:1px solid var(--mp-line);
}
.mp-brand { display:flex; align-items:center; gap:10px; font-weight:900; letter-spacing:.3px; }
.mp-brand .emoji { filter: drop-shadow(0 0 6px rgba(59,130,246,.4)); }
.mp-close {
  border:1px solid var(--mp-line); background:transparent; color:var(--mp-sub);
  border-radius:10px; padding:6px 10px; cursor:pointer;
}

.mp-tabs { display:flex; gap:8px; padding:10px 12px; border-block-end:1px dashed var(--mp-line); }
.mp-tabbtn {
  flex:1; background:transparent; color:var(--mp-text);
  border:1px dashed var(--mp-line); border-radius:999px; padding:8px 10px; cursor:pointer; font-size:12px;
  transition: background .25s ease, border-color .25s ease, box-shadow .25s ease;
}
.mp-tabbtn.active {
  background: linear-gradient(90deg, rgba(59,130,246,.15), rgba(239,68,68,.12));
  border-color: rgba(96,165,250,.45); box-shadow: 0 4px 16px rgba(2,6,23,.4);
}

.mp-content { overflow:auto; padding:12px 12px 18px; display:flex; flex-direction:column; gap:14px; min-block-size:0; }
.mp-section {
  border:1px dashed var(--mp-line); border-radius:12px; padding:12px;
  display:flex; flex-direction:column; gap:10px;
  background: rgba(255,255,255,.02);
}

.mp-field { display:flex; flex-direction:column; gap:6px }
.mp-field span { font-size:12px; color:var(--mp-sub) }
.mp-field input {
  padding:10px 12px; border-radius:10px; border:1px solid var(--mp-line);
  background: rgba(255,255,255,.02); color:var(--mp-text); outline:none;
}

.mp-cta {
  align-self:flex-start; background: linear-gradient(135deg, var(--mp-acc), var(--mp-acc2));
  color:#0b1020; border:0; border-radius:12px; padding:8px 14px; font-weight:900; cursor:pointer;
  box-shadow: 0 8px 28px rgba(59,130,246,.25);
}

.mp-subtitle { font-weight:900; letter-spacing:.3px }
.mp-small { color: var(--mp-sub); font-size:12px }

.mp-plans { display:grid; grid-template-columns: 1fr; gap:10px; }
@media (min-width:560px){ .mp-plans{ grid-template-columns: 1fr 1fr; } }

.mp-card {
  position:relative; border:1px solid var(--mp-line); border-radius:14px; padding:12px;
  display:flex; flex-direction:column; gap:8px;
  background: linear-gradient(180deg, rgba(255,255,255,.02), rgba(0,0,0,.10));
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.04);
  transition: border-color .25s ease, box-shadow .25s ease;
}
.mp-card input { position:absolute; inset-block-start:10px; inset-inline-end:10px }
.mp-card.selected {
  border-color: rgba(96,165,250,.45);
  box-shadow: 0 8px 26px rgba(2,6,23,.45), 0 0 18px -8px rgba(96,165,250,.55)
}
.mp-pname { font-weight:900 }
.mp-price { font-size:22px; font-weight:900; color:#93c5fd }
.mp-list { margin:0; padding-inline-start:18px; color:var(--mp-sub); font-size:13px; display:flex; flex-direction:column; gap:4px }

.mp-pcta {
  align-self:flex-start; background:transparent; color:var(--mp-text);
  border:1px dashed var(--mp-line); border-radius:10px; padding:8px 12px; cursor:pointer
}
.mp-pcta:hover { border-color: rgba(96,165,250,.45); box-shadow: 0 4px 16px rgba(2,6,23,.4) }
`;

export default function MembershipPanel({
  isOpen,
  onClose,
  brandName = "ChatMig",
  brandEmoji = "🛂",
  initialTab = "signup",
  initialPlan = "free",
  onLogin,
  onSignup,
  onCheckout,
  renderPayButton,
  themeVars,
}: MembershipPanelProps) {
  const [tab, setTab] = useState<TabId>(initialTab);
  const [plan, setPlan] = useState<PlanId>(initialPlan);
  const panelRef = useRef<HTMLElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Portal container (SSR-safe)
  const container = useMemo(() => {
    if (typeof document === "undefined") return null;
    let el = document.getElementById("mp-root");
    if (!el) { el = document.createElement("div"); el.id = "mp-root"; document.body.appendChild(el); }
    return el;
  }, []);

  // Scroll lock + ESC + initial focus + focus trap
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    // focus inicial
    setTimeout(() => closeBtnRef.current?.focus(), 0);

    // Focus trap
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const list = Array.from(focusables).filter(el => !el.hasAttribute("disabled"));
      if (list.length === 0) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keydown", trap);
    };
  }, [isOpen, onClose]);

  // Overlay click fuera del panel
  const onOverlayClick = (ev: React.MouseEvent<HTMLDivElement>) => {
    if (ev.target === ev.currentTarget) onClose();
  };

  // Theming
  const themeStyle: React.CSSProperties | undefined = themeVars ? {
    ...(themeVars.bg &&   { ["--mp-bg"   as any]: themeVars.bg }),
    ...(themeVars.panel &&{ ["--mp-panel"as any]: themeVars.panel }),
    ...(themeVars.text && { ["--mp-text" as any]: themeVars.text }),
    ...(themeVars.sub &&  { ["--mp-sub"  as any]: themeVars.sub }),
    ...(themeVars.line && { ["--mp-line" as any]: themeVars.line }),
    ...(themeVars.acc &&  { ["--mp-acc"  as any]: themeVars.acc }),
    ...(themeVars.acc2 && { ["--mp-acc2" as any]: themeVars.acc2 }),
  } : undefined;

  // Stubs si no pasas callbacks
  const fallbackLogin   = (email: string, _pass: string) => alert(`Login demo ✅\nEmail: ${email}`);
  const fallbackSignup  = (email: string, _pass: string) => alert(`Signup demo ✅\nEmail: ${email}`);
  const fallbackCheckout= (p: PlanId) => alert(`Checkout demo ✅\nPlan: ${p.toUpperCase()}`);

  const handleLogin  = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const pass  = String(fd.get("password") || "").trim();
    (onLogin ?? fallbackLogin)(email, pass);
  };
  const handleSignup = (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const pass  = String(fd.get("password") || "").trim();
    (onSignup ?? fallbackSignup)(email, pass);
  };
  const handleCheckout = (p: PlanId) => (onCheckout ?? fallbackCheckout)(p);

  // Catálogo UI (precio solo etiqueta visual)
  const plans = useMemo(() => ([
    { id: "free"    as const, name: "Free",    price: "$0",          bullets: ["Mensajes básicos","Sin TTS automático"], paypal: undefined },
    { id: "pro"     as const, name: "Pro",     price: "$20 / mes",   bullets: ["Modelos premium","Audio TTS incluido"],  paypal: P_PRO },
    { id: "premium" as const, name: "Premium", price: "$50 / mes",   bullets: ["Todo Pro + Prioridad","Herramientas avanzadas"], paypal: P_PREMIUM },
  ]), []);

  // Link directo a PayPal si no usas botón embebido
  const subscriptionLink = (planId: string) => {
    const base = "https://www.paypal.com/webapps/billing/subscriptions";
    const u = new URL(base);
    u.searchParams.set("plan_id", planId);
    if (SUCCESS_URL) u.searchParams.set("return_url", SUCCESS_URL);
    if (CANCEL_URL)  u.searchParams.set("cancel_url", CANCEL_URL);
    return u.toString();
  };

  if (!isOpen || !container) return null;

  const headerId = "mp-header-title";

  return createPortal(
    <>
      <style>{styles}</style>

      <div
        className="mp-overlay"
        role="presentation"
        onClick={onOverlayClick}
        aria-hidden="true"
        style={themeStyle}
      />

      <aside
        ref={panelRef}
        className="mp-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headerId}
        style={themeStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mp-header">
          <div id={headerId} className="mp-brand" aria-label={`${brandName} Membresías`}>
            <span className="emoji" aria-hidden="true">{brandEmoji}</span>
            <span>{brandName} • Membresías</span>
          </div>
          <button ref={closeBtnRef} className="mp-close" onClick={onClose} aria-label="Cerrar panel">✕</button>
        </div>

        <div className="mp-tabs" role="tablist" aria-label="Autenticación">
          <button role="tab" aria-selected={tab === "signup"} className={`mp-tabbtn ${tab === "signup" ? "active" : ""}`} onClick={() => setTab("signup")}>Crear cuenta</button>
          <button role="tab" aria-selected={tab === "login"}  className={`mp-tabbtn ${tab === "login" ? "active" : ""}`}   onClick={() => setTab("login")}>Iniciar sesión</button>
        </div>

        <div className="mp-content">
          {tab === "signup" ? (
            <form className="mp-section" onSubmit={handleSignup} aria-label="Formulario de registro">
              <label className="mp-field"><span>Email</span>
                <input name="email" type="email" placeholder="tucorreo@ejemplo.com" required />
              </label>
              <label className="mp-field"><span>Contraseña</span>
                <input name="password" type="password" placeholder="Mínimo 8 caracteres" required minLength={8} />
              </label>
              <button className="mp-cta" type="submit">Crear cuenta</button>
            </form>
          ) : (
            <form className="mp-section" onSubmit={handleLogin} aria-label="Formulario de inicio de sesión">
              <label className="mp-field"><span>Email</span>
                <input name="email" type="email" placeholder="tucorreo@ejemplo.com" required />
              </label>
              <label className="mp-field"><span>Contraseña</span>
                <input name="password" type="password" placeholder="Tu contraseña" required />
              </label>
              <button className="mp-cta" type="submit">Entrar</button>
            </form>
          )}

          <div className="mp-section">
            <div className="mp-subtitle">Membresías</div>

            <div className="mp-plans" role="radiogroup" aria-label="Selecciona un plan">
              {plans.map(p => (
                <label key={p.id} className={`mp-card ${plan === p.id ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="plan"
                    value={p.id}
                    checked={plan === p.id}
                    onChange={() => setPlan(p.id)}
                  />
                  <div className="mp-pname">{p.name}</div>
                  <div className="mp-price">{p.price}</div>
                  <ul className="mp-list">{p.bullets.map((b,i)=><li key={i}>{b}</li>)}</ul>

                  {p.id === "free" ? (
                    <button type="button" className="mp-pcta" onClick={() => handleCheckout("free")}>
                      Seguir con Free
                    </button>
                  ) : p.paypal ? (
                    <>
                      {/* Si te pasan renderPayButton, lo usamos (embebido). Si no, link directo */}
                      {renderPayButton
                        ? renderPayButton(p.paypal, p.id)
                        : <a className="mp-pcta" href={subscriptionLink(p.paypal)}>Pagar con PayPal</a>}
                      <button
                        type="button"
                        className="mp-pcta"
                        style={{ marginTop: 8 }}
                        onClick={() => handleCheckout(p.id)}
                        title="Registrar intento de checkout en tu backend (opcional)"
                      >
                        Continuar
                      </button>
                    </>
                  ) : (
                    <button type="button" className="mp-pcta" onClick={() => handleCheckout(p.id)}>
                      Elegir {p.name}
                    </button>
                  )}
                </label>
              ))}
            </div>
          </div>

          <div className="mp-section">
            <div className="mp-small">
              Conecta las APIs reemplazando <code>onLogin</code>, <code>onSignup</code> y <code>onCheckout(plan)</code>.
              Para PayPal embebido, pasa <code>renderPayButton(planIdPaypal, planIdUi)</code>.
            </div>
          </div>
        </div>
      </aside>
    </>,
    container
  );
}

