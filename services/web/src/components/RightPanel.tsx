<aside className="sidebar rp-panel">
  <header className="rp-header">
    <div className="rp-title">👤 Cuenta</div>
    <div className="rp-sub">Gestiona acceso y planes</div>
    <div className="rp-tabs">
      <button className="rp-tab active">Iniciar sesión</button>
      <button className="rp-tab">Crear cuenta</button>
      <button className="rp-tab">Membresías</button>
    </div>
  </header>

  <div className="rp-scroll">
    <section className="rp-section">
      <h3>Acceso</h3>
      <div className="rp-card">
        <form className="rp-form">
          <div className="rp-row">
            <label>Email</label>
            <input className="rp-input" type="email" />
          </div>
          <div className="rp-row">
            <label>Contraseña</label>
            <input className="rp-input" type="password" />
            <div className="rp-help">Mínimo 8 caracteres</div>
          </div>
          <div className="rp-actions">
            <button className="rp-btn primary block" type="submit">Iniciar sesión</button>
            <button className="rp-btn ghost block" type="button">Continuar con Google</button>
          </div>
        </form>
      </div>
    </section>

    <div className="rp-divider">o</div>

    <section className="rp-section">
      <h3>Membresías</h3>
      <div className="rp-pricing">
        <div className="rp-plan pro">
          <div className="rp-plan-head">
            <span className="rp-badge pro">PRO</span>
            <span className="rp-price">$20/mes</span>
          </div>
          <ul className="rp-feats">
            <li>Más mensajes</li>
            <li>Modelos premium</li>
          </ul>
          <div className="rp-actions" style={{marginTop: 10}}>
            <button className="rp-btn success block">Elegir PRO</button>
          </div>
          <div className="rp-legal">Cancela cuando quieras.</div>
        </div>

        <div className="rp-plan premium">
          <div className="rp-plan-head">
            <span className="rp-badge premium">PREMIUM</span>
            <span className="rp-price">$50/mes</span>
          </div>
          <ul className="rp-feats">
            <li>Prioridad de cómputo</li>
            <li>Herramientas avanzadas</li>
          </ul>
          <div className="rp-actions" style={{marginTop: 10}}>
            <button className="rp-btn primary block">Elegir PREMIUM</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</aside>

