import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { loadUpcoming, upcomingKey } from './api'
import {
  buildCalendarMonth,
  filterByWallet,
  gridRange,
  shiftMonth,
} from './calendar-model'

const localToday = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** State and data for the home calendar: month navigation + wallet filter. */
export function useUpcomingCalendar() {
  const today = localToday()
  const currentMonth = today.slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const [walletId, setWalletId] = useState<string>()
  const { from, to } = gridRange(month)

  const query = useQuery({
    queryKey: upcomingKey(from, to),
    queryFn: ({ signal }) => loadUpcoming(from, to, signal),
    staleTime: 60_000,
  })

  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })

  const occurrences = useMemo(() => query.data?.occurrences ?? [], [query.data])
  const weeks = useMemo(
    () =>
      buildCalendarMonth(month, filterByWallet(occurrences, walletId), today),
    [month, occurrences, walletId, today],
  )

  return {
    query,
    today,
    month,
    weeks,
    wallets: wallets.data ?? [],
    walletId,
    setWalletId,
    canGoBack: month > currentMonth,
    previous: () => setMonth((value) => shiftMonth(value, -1)),
    next: () => setMonth((value) => shiftMonth(value, 1)),
  }
}
