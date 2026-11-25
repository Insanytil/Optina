import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { forecastRecurrences } from '../recurrences/api'
import { buildForecastView } from './forecast-model'
import type { ForecastHorizon } from './forecast-model'

/** Same cache key as the wallet dashboard panel, so both views share data. */
export function useForecast(walletId: string, months: ForecastHorizon) {
  const query = useQuery({
    queryKey: ['wallets', 'recurrence-forecast', walletId, months],
    queryFn: ({ signal }) => forecastRecurrences(walletId, months, signal),
    staleTime: 60_000,
  })
  const view = useMemo(
    () => (query.data ? buildForecastView(query.data) : undefined),
    [query.data],
  )
  return { ...query, view }
}
