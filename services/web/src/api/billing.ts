import { supabase } from '../lib/supabaseClient'

export async function createCheckout(tier: 'pro' | 'business') {
  const { data, error } = await supabase.functions.invoke('billing-create-checkout', {
    body: { tier }
  })
  if (error) throw error
  return data as { url: string }
}

export async function getPortalUrl() {
  const { data, error } = await supabase.functions.invoke('billing-portal', { body: {} })
  if (error) throw error
  return data as { url: string }
}

export async function getMembershipStatus() {
  const { data, error } = await supabase.functions.invoke('membership-status', { body: {} })
  if (error) throw error
  return data as { tier: string; active: boolean; current_period_end?: string; quota_left: number }
}

