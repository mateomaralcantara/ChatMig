import React from 'react'
import { useMembership } from '../../hooks/useMembership'

export function PaywallGuard({
  needTokens = 1000,
  children,
  fallback
}: {
  needTokens?: number
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  const { loading, tier, quotaLeft } = useMembership()

  if (loading) return <span>...</span>
  if (quotaLeft < needTokens) return <>{fallback ?? <span>Sin cuota. Mejora tu plan.</span>}</>
  return <>{children}</>
}

