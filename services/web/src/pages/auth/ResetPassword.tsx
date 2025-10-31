import React, { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ResetPassword() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const submit = async () => {
    setMsg(null)
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) setMsg(error.message)
    else setMsg('Listo. Tu contraseña fue actualizada.')
  }

  return (
    <div style={{ padding: 24 }}>
      <h3>Restablecer contraseña</h3>
      <input type="password" placeholder="Nueva contraseña" value={pw} onChange={e=>setPw(e.target.value)} />
      <button onClick={submit} disabled={pw.length < 8}>Actualizar</button>
      {msg && <p>{msg}</p>}
      <p style={{ opacity: .7, marginTop: 8 }}>Abrí este link desde el email de recuperación para que funcione.</p>
    </div>
  )
}

