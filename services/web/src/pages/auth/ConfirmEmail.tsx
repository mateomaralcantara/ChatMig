import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ConfirmEmail() {
  const [status, setStatus] = useState<'checking' | 'ok' | 'error'>('checking')

  useEffect(() => {
    // Supabase procesa el hash del link y crea sesión; solo verificamos
    const run = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setStatus(session ? 'ok' : 'error')
    }
    run()
  }, [])

  return (
    <div style={{ padding: 24 }}>
      {status === 'checking' && <p>Confirmando...</p>}
      {status === 'ok' && <p>✅ Email confirmado. Ya podés usar tu cuenta.</p>}
      {status === 'error' && <p>⚠️ No pudimos confirmar. Abrí el enlace desde el mismo dispositivo/correo.</p>}
    </div>
  )
}

