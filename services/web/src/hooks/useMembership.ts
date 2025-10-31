import { useEffect, useState } from 'react'
import { getMembershipStatus } from '../api/billing'
import { supabase } from '../lib/supabaseClient'

export function useMembership() {
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<'free' | 'pro' | 'business'>('free')
  const [active, setActive] = useState(false)
  const [periodEnd, setPeriodEnd] = useState<string | undefined>()
  const [quotaLeft, setQuotaLeft] = useState(0)

  const load = async () => {
    setLoading(true)
    try {
      const s = await getMembershipStatus()
      setTier(s.tier as any)
      setActive(!!s.active)
      setPeriodEnd(s.current_period_end)
      setQuotaLeft(s.quota_left)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const { data: sub } = supabase.auth.onAuthStateChange(() => load())
    return () => sub.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { loading, tier, active, periodEnd, quotaLeft, reload: load }
}

