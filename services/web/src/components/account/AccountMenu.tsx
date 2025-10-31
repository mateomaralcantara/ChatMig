import React, { useState } from 'react'
import { useAuth } from '../../auth/SupaAuthProvider'
import { useMembership } from '../../hooks/useMembership'
import { createCheckout, getPortalUrl } from '../../api/billing'

export default function AccountMenu() {
  const { user, signOut } = useAuth()
  const { tier, active, quotaLeft, reload } = useMembership()
  const [busy, setBusy] = useState(false)

  const upgrade = async () => {
    setBusy(true)
    try {
      const { url } = await createCheckout('pro')
      window.location.href = url
    } finally { setBusy(false) }
  }
  const openPortal = async () => {
    setBusy(true)
    try {
      const { url } = await getPortalUrl()
      window.location.href = url
    } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 12, border: '1px solid #333', borderRadius: 8 }}>
      <div><b>{user?.email}</b></div>
      <div>Plan: {tier} {active ? '✅' : '⛔'}</div>
      <div>Cuota disponible hoy: {quotaLeft}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button onClick={upgrade} disabled={busy}>Mejorar a Pro</button>
        <button onClick={openPortal} disabled={busy}>Portal</button>
        <button onClick={()=>{ signOut(); reload(); }}>Salir</button>
      </div>
    </div>
  )
}

