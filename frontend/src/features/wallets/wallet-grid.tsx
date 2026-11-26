import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Wallet as WalletIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listWallets, walletKeys } from './api'
import type { Wallet } from './api'
import { WalletCard } from './wallet-card'

/**
 * Paginated wallet tiles with loading, error and empty states.
 * The parent owns `page` so it can react to creations and deletions.
 */
export function WalletGrid({
  page,
  onPageChange,
  renderActions,
  emptyAction,
}: {
  page: number
  onPageChange: (page: number) => void
  renderActions?: (wallet: Wallet) => ReactNode
  emptyAction?: ReactNode
}) {
  const query = useQuery({
    queryKey: walletKeys.page(page),
    queryFn: ({ signal }) => listWallets(page, signal),
  })

  if (query.isPending)
    return (
      <p role="status" className="py-12 text-center text-muted-foreground">
        Chargement des portefeuilles…
      </p>
    )
  if (query.isError)
    return (
      <div className="space-y-3 rounded-xl border p-6">
        <p role="alert" className="text-sm text-destructive">
          {query.error.message}
        </p>
        <Button
          variant="outline"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Réessayer
        </Button>
      </div>
    )

  const { items, pagination } = query.data
  return (
    <>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
          <WalletIcon
            className="mb-2 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-semibold">
            {page === 1
              ? 'Votre premier portefeuille'
              : 'Aucun portefeuille sur cette page'}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {page === 1
              ? 'Ajoutez un compte ou un portefeuille pour commencer à suivre votre budget.'
              : 'Revenez à la page précédente pour retrouver vos portefeuilles.'}
          </p>
          {page === 1 && emptyAction}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((wallet) => (
            <WalletCard
              key={wallet.id}
              wallet={wallet}
              actions={renderActions?.(wallet)}
            />
          ))}
        </div>
      )}
      {(pagination.total_pages > 1 || page > 1) && (
        <nav
          aria-label="Pagination des portefeuilles"
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
        >
          <span className="text-sm text-muted-foreground">
            Page {page} sur {Math.max(page, pagination.total_pages)} ·{' '}
            {pagination.total} portefeuille(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Précédent
            </Button>
            <Button
              variant="outline"
              disabled={page >= pagination.total_pages}
              onClick={() => onPageChange(page + 1)}
            >
              Suivant
            </Button>
          </div>
        </nav>
      )}
    </>
  )
}
