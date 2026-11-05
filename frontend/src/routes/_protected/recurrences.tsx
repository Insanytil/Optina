import { createFileRoute } from '@tanstack/react-router'
import { RecurrencesPage } from '@/features/recurrences/recurrences-page'

export const Route = createFileRoute('/_protected/recurrences')({
  validateSearch: (search: Record<string, unknown>): { walletId?: string } => ({
    walletId:
      typeof search.walletId === 'string' &&
      /^[0-9a-f-]{36}$/i.test(search.walletId)
        ? search.walletId
        : undefined,
  }),
  component: Page,
})
function Page() {
  const { walletId } = Route.useSearch()
  return (
    <RecurrencesPage key={walletId ?? 'default'} initialWalletId={walletId} />
  )
}
