import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownLeft, ArrowUpRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { listTransactions, transactionKeys } from '@/features/transactions/api'
import type {
  Transaction,
  TransactionFilters,
} from '@/features/transactions/api'
import { CategorySearch } from '@/features/categories/category-search'
import { TransactionForm } from '@/features/transactions/transaction-form'
import { DeleteTransactionDialog } from '@/features/transactions/delete-transaction-dialog'
import { formatBalance } from './api'
import type { Wallet } from './api'
import type { WalletDateRange } from './period'

const selectClass =
  'h-10 min-w-0 rounded-lg border border-input bg-background px-3 text-sm'

export function WalletTransactions({
  wallet,
  period,
}: {
  wallet: Wallet
  period: WalletDateRange
}) {
  const [page, setPage] = useState(1)
  const [categoryId, setCategoryId] = useState('')
  const [type, setType] = useState('')
  const [kind, setKind] = useState('')
  const [editor, setEditor] = useState<Transaction | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const filters: TransactionFilters = {
    wallet_id: wallet.id,
    ...period,
    category_id: categoryId,
    type,
    kind,
    include_subcategories: true,
  }
  const query = useQuery({
    queryKey: transactionKeys.page(page, filters),
    queryFn: ({ signal }) => listTransactions(page, filters, signal),
  })
  const categoryNames = new Map(
    categories.data?.map((item) => [item.id, item.name]),
  )
  const canCreate = categories.isSuccess && categories.data.length > 0
  return (
    <section
      className="flex flex-col gap-4 lg:min-h-0 lg:flex-1"
      aria-labelledby="wallet-transactions-title"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="wallet-transactions-title"
            className="text-xl font-semibold tracking-tight"
          >
            Transactions de la période
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Uniquement les mouvements de ce portefeuille.
          </p>
        </div>
        <Button disabled={!canCreate} onClick={() => setEditor('new')}>
          <Plus aria-hidden="true" />
          Ajouter une transaction
        </Button>
      </header>
      {categories.isError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4 text-sm"
        >
          <p>Impossible de charger les catégories.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void categories.refetch()}
          >
            Réessayer
          </Button>
        </div>
      )}
      {categories.isSuccess && !categories.data.length && (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm">
          Pour ajouter une transaction,{' '}
          <Link to="/categories" className="underline">
            créez une catégorie
          </Link>
          .
        </p>
      )}
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="wallet-category-filter">Catégorie</Label>
          <CategorySearch
            id="wallet-category-filter"
            value={categoryId}
            onChange={(value) => {
              setCategoryId(value)
              setPage(1)
            }}
            categories={categories.data ?? []}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="wallet-type-filter">Type</Label>
          <select
            id="wallet-type-filter"
            className={`${selectClass} w-full`}
            value={type}
            onChange={(event) => {
              setType(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Dépenses et rentrées</option>
            <option value="expense">Dépenses</option>
            <option value="income">Rentrées</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="wallet-kind-filter">Mouvements</Label>
          <select
            id="wallet-kind-filter"
            className={`${selectClass} w-full`}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value)
              setPage(1)
            }}
          >
            <option value="">Tous les mouvements</option>
            <option value="standard">Transactions ordinaires</option>
            <option value="opening_balance">Solde initial</option>
          </select>
        </div>
        {categoryId && (
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Les sous-catégories sont incluses dans le filtre.
          </p>
        )}
      </div>
      {query.isPending ? (
        <p role="status" className="py-10 text-center text-muted-foreground">
          Chargement des transactions…
        </p>
      ) : query.isError ? (
        <div className="space-y-3 rounded-xl border p-6">
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          {query.data.items.length === 0 ? (
            <div className="rounded-xl border border-dashed px-6 py-12 text-center">
              <h3 className="font-medium">Aucun mouvement sur cette période</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Ajoutez une transaction, changez la période ou ajustez les
                filtres.
              </p>
            </div>
          ) : (
            <div className="relative overflow-x-auto rounded-xl border lg:min-h-0 lg:overflow-y-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Mouvements du portefeuille {wallet.name}
                </caption>
                <thead className="sticky top-0 z-10 border-b bg-muted text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Libellé</th>
                    <th className="px-4 py-3 font-medium">Catégorie</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Montant
                    </th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {query.data.items.map((transaction) => (
                    <tr key={transaction.id}>
                      <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">
                        {transaction.date.split('-').reverse().join('/')}
                      </td>
                      <td className="max-w-80 px-4 py-4">
                        <div className="flex items-center gap-2">
                          {transaction.type === 'expense' ? (
                            <ArrowUpRight
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                          ) : (
                            <ArrowDownLeft
                              className="size-4 shrink-0 text-emerald-700 dark:text-emerald-400"
                              aria-hidden="true"
                            />
                          )}
                          <span
                            className="truncate font-medium"
                            title={transaction.label}
                          >
                            {transaction.label}
                          </span>
                        </div>
                        {transaction.recurrence_id && (
                          <span className="text-xs text-muted-foreground">
                            Récurrente
                          </span>
                        )}
                        {transaction.kind === 'opening_balance' && (
                          <span className="mt-1 inline-block rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Solde initial · hors indicateurs
                          </span>
                        )}
                        {transaction.note && (
                          <p
                            className="mt-1 truncate text-xs text-muted-foreground"
                            title={transaction.note}
                          >
                            {transaction.note}
                          </p>
                        )}
                      </td>
                      <td className="max-w-48 truncate px-4 py-4">
                        {transaction.category_id
                          ? (categoryNames.get(transaction.category_id) ??
                            (categories.isError
                              ? 'Catégorie indisponible'
                              : 'Chargement…'))
                          : '—'}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-4 text-right font-medium tabular-nums ${transaction.type === 'income' ? 'text-emerald-700 dark:text-emerald-400' : ''}`}
                      >
                        {transaction.type === 'income' ? '+' : '−'}
                        {formatBalance(transaction.amount)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={
                              !categories.isSuccess &&
                              transaction.kind !== 'opening_balance'
                            }
                            aria-label={`Modifier ${transaction.label}`}
                            onClick={() => setEditor(transaction)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Supprimer ${transaction.label}`}
                            onClick={() => setDeleting(transaction)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(query.data.pagination.total_pages > 1 || page > 1) && (
            <nav
              aria-label="Pagination des transactions"
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <span className="text-sm text-muted-foreground">
                Page {page} sur{' '}
                {Math.max(page, query.data.pagination.total_pages)} ·{' '}
                {query.data.pagination.total} mouvement(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  disabled={page >= query.data.pagination.total_pages}
                  onClick={() => setPage(page + 1)}
                >
                  Suivant
                </Button>
              </div>
            </nav>
          )}
        </>
      )}
      <p
        role="status"
        className={notice ? 'text-sm text-muted-foreground' : 'sr-only'}
      >
        {notice}
      </p>
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null)
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {editor === 'new'
                ? 'Ajouter une transaction'
                : editor?.kind === 'opening_balance'
                  ? 'Modifier le solde initial'
                  : 'Modifier la transaction'}
            </DialogTitle>
            <DialogDescription>
              Portefeuille : {wallet.name}. Le solde sera mis à jour à
              l’enregistrement.
            </DialogDescription>
          </DialogHeader>
          {editor &&
            (categories.isSuccess ||
              (editor !== 'new' && editor.kind === 'opening_balance')) && (
              <TransactionForm
                key={editor === 'new' ? 'new' : editor.id}
                transaction={editor === 'new' ? undefined : editor}
                wallets={[wallet]}
                categories={categories.data ?? []}
                lockedWallet
                initialWalletId={wallet.id}
                initialCategoryId={categoryId}
                onBusy={setBusy}
                onCancel={() => setEditor(null)}
                onSaved={() => {
                  setEditor(null)
                  setBusy(false)
                  setPage(1)
                  setNotice(
                    'Le mouvement a été enregistré et les indicateurs mis à jour.',
                  )
                }}
              />
            )}
        </DialogContent>
      </Dialog>
      {deleting && (
        <DeleteTransactionDialog
          transaction={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            setNotice('Le mouvement a été supprimé et le solde mis à jour.')
            if (query.data?.items.length === 1 && page > 1) setPage(page - 1)
          }}
        />
      )}
    </section>
  )
}
