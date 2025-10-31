import React from 'react'
import { useAuth } from '../../auth/SupaAuthProvider'

export default function VerifyEmailBanner() {
  const { user } = useAuth()
  const verified = !!user?.email_confirmed_at
  if (verified) return null
  return (
    <div style={{ padding: 10, background: '#262b', border: '1px solid #444', borderRadius: 8, margin: '8px 0' }}>
      <b>Verificá tu email</b>: revisá tu bandeja y seguí el enlace para confirmar tu cuenta.
    </div>
  )
}

