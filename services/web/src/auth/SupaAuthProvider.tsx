import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Session, User, AuthChangeEvent } from '@supabase/supabase-js'

type Ctx = {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string) => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
  signOut: () => Promise<void>
  authHeader: () => Promise<string | null>
}
const AuthCtx = createContext<Ctx | null>(null)

export function SupaAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession()
      const s: Session | null = data.session
      setSession(s)
      setUser(s?.user ?? null)
      setLoading(false)
    })()
    const { data: sub } = supabase.auth.onAuthStateChange((_: AuthChangeEvent, s: Session | null) => {
      setSession(s ?? null)
      setUser(s?.user ?? null)
      if (s?.user) import('./storage').then(m => m.migrateAnonDataToUser(s.user!.id))
    })
    return () => sub.subscription.unsubscribe()
  }, [])
  // ... resto igual

