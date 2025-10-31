import React, { useState } from 'react'
import { createCheckout, getPortalUrl } from '../../api/billing'
import { useMembership } from '../../hooks/useMembership'

export default function Billing() {
  const { tier, active, quotaLeft, periodEnd } = useMembership()
  const [busy, setBusy] = useState(false)

  const upgrade = async () => {
    setBusy(true); try { const { url } = await createCheckout('pro'); window.location.href = url } finally { setBusy(false) }
  }
  const portal = async () => {
    setBusy(true); try { const { url } = await getPortalUrl(); window.location.href = url } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 24 }}>
      <h3>Facturación</h3>
      <p>Plan: <b>{tier}</b> {active ? '✅ activo' : '⛔ inactivo'}</p>
      <p>Cuota disponible hoy: <b>{quotaLeft}</b></p>
      {periodEnd && <p>Renovación: {new Date(periodEnd).toLocaleString()}</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button onClick={upgrade} disabled={busy}>Mejorar a Pro</button>
        <button onClick={portal} disabled={busy}>Abrir Portal</button>
      </div>
    </div>
  )
}

