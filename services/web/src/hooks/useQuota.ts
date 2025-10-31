import { useEffect, useState } from 'react'
import { useMembership } from './useMembership'
import * as quotaStore from '../store/quota'

export function useQuota() {
  const { quotaLeft, reload } = useMembership()
  const [localUsed, setLocalUsed] = useState(quotaStore.getUsedToday())

  useEffect(() => {
    const off = quotaStore.onChange((v) => setLocalUsed(v))
    return off
  }, [])

  const useTokens = (n: number) => {
    quotaStore.addTokens(n)
  }

  return {
    hardQuotaLeft: Math.max(quotaLeft - localUsed, 0),
    markUse: useTokens,
    refresh: reload
  }
}

