import React, { useState } from 'react'
import { useAuth } from '../../auth/SupaAuthProvider'

export default function AuthDialog() {
  const { signInWithPassword, signUpWithPassword, sendMagicLink } = useAuth()
  const [tab, setTab] = useState<'login' | 'register' | 'magic'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const act = async () => {
    setLoading(true); setMsg(null)
    try {
      if (tab === 'login') await signInWithPassword(email, pw)
      else if (tab === 'register') await signUpWithPassword(email, pw)
      else await sendMagicLink(email)
      setMsg('Listo. Revisa tu correo.')
    } catch (e: any) {
      setMsg(e.message ?? 'Error')
    } finally { setLoading(false) }
  }
  return (
    <div style={{ padding: 16, minWidth: 320 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => setTab('login')} disabled={tab==='login'}>Login</button>
        <button onClick={() => setTab('register')} disabled={tab==='register'}>Registro</button>
        <button onClick={() => setTab('magic')} disabled={tab==='magic'}>Magic Link</button>
      </div>
      <input placeholder="email" value={email} onChange={e=>setEmail(e.target.value)} />
      {tab!=='magic' && (
        <input placeholder="password" type="password" value={pw} onChange={e=>setPw(e.target.value)} />
      )}
      <button onClick={act} disabled={loading || !email || (tab!=='magic' && !pw)}>
        {loading ? '...' : (tab==='login' ? 'Entrar' : tab==='register' ? 'Crear cuenta' : 'Enviar link')}
      </button>
      {msg && <p>{msg}</p>}
    </div>
  )
}

