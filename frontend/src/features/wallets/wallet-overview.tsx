import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Pencil, Plus, Trash2, Wallet as WalletIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatBalance, listWallets, walletKeys } from './api'
import type { Wallet } from './api'
import { WalletForm } from './wallet-form'
import { DeleteWalletDialog } from './delete-wallet-dialog'

export function WalletOverview({ home = false }: { home?: boolean }) {
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Wallet | null>(null)
  const [editor, setEditor] = useState<Wallet | 'new' | null>(null)
  const query = useQuery({
    queryKey: walletKeys.page(page),
    queryFn: ({ signal }) => listWallets(page, signal),
  })
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {home ? 'Vos portefeuilles' : 'Portefeuilles'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Retrouvez vos comptes et leurs soldes au même endroit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {home && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/overview" />}
            >
              Vue globale
            </Button>
          )}
          <Button onClick={() => setEditor('new')}>
            <Plus aria-hidden="true" />
            Créer un portefeuille
          </Button>
        </div>
      </header>
      {query.isPending ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Chargement des portefeuilles…
        </p>
      ) : query.isError ? (
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
      ) : (
        <>
          {query.data.items.length === 0 ? (
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
              {page === 1 && (
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => setEditor('new')}
                >
                  <Plus aria-hidden="true" />
                  Créer un portefeuille
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {query.data.items.map((wallet) => (
                <article
                  key={wallet.id}
                  className="min-w-0 rounded-xl border bg-card p-5 shadow-sm"
                >
                  <div className="mb-6 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <WalletIcon className="size-4" aria-hidden="true" />
                      </div>
                      <h2 className="truncate font-medium" title={wallet.name}>
                        <Link
                          to="/wallets/$walletId"
                          params={{ walletId: wallet.id }}
                          className="rounded-sm hover:underline focus-visible:outline-2"
                        >
                          {wallet.name}
                        </Link>
                      </h2>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Modifier ${wallet.name}`}
                        onClick={() => setEditor(wallet)}
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Supprimer ${wallet.name}`}
                        onClick={() => setDeleting(wallet)}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <Link
                    to="/wallets/$walletId"
                    params={{ walletId: wallet.id }}
                    className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ouvrir le portefeuille ${wallet.name}`}
                  >
                    <p className="text-xs text-muted-foreground">
                      Solde actuel
                    </p>
                    <p className="mt-1 break-words text-2xl font-semibold tracking-tight tabular-nums">
                      {formatBalance(wallet.balance)}
                    </p>
                    <p className="mt-5 text-sm text-muted-foreground">
                      Ouvrir le portefeuille →
                    </p>
                  </Link>
                </article>
              ))}
            </div>
          )}
          {(query.data.pagination.total_pages > 1 || page > 1) && (
            <nav
              aria-label="Pagination des portefeuilles"
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
            >
              <span className="text-sm text-muted-foreground">
                Page {page} sur{' '}
                {Math.max(page, query.data.pagination.total_pages)} ·{' '}
                {query.data.pagination.total} portefeuille(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= query.data.pagination.total_pages}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Suivant
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
      {deleting && (
        <DeleteWalletDialog
          wallet={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            if (query.data?.items.length === 1 && page > 1)
              setPage((value) => value - 1)
          }}
        />
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor === 'new'
                ? 'Créer un portefeuille'
                : 'Modifier le portefeuille'}
            </DialogTitle>
            <DialogDescription>
              {editor === 'new'
                ? 'Donnez un nom à votre portefeuille et renseignez son solde initial.'
                : 'Modifiez le nom de votre portefeuille.'}
            </DialogDescription>
          </DialogHeader>
          {editor !== null && (
            <WalletForm
              key={editor === 'new' ? 'new' : editor.id}
              wallet={editor === 'new' ? undefined : editor}
              onSaved={() => {
                setEditor(null)
                if (editor === 'new') setPage(1)
              }}
              onCancel={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
