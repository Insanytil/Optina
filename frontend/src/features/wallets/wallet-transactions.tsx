import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Pencil, Repeat, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import type { Category } from '@/features/categories/api'
import { CategorySearch } from '@/features/categories/category-search'
import { listTransactions, transactionKeys } from '@/features/transactions/api'
import type {
  Transaction,
  TransactionFilters,
} from '@/features/transactions/api'
import { DeleteTransactionDialog } from '@/features/transactions/delete-transaction-dialog'
import { TransactionForm } from '@/features/transactions/transaction-form'
import { cn } from 'cn'
import { formatBalance } from './api'
import type { Wallet } from './api'
import { rootColors } from './category-colors'
import type { WalletDateRange } from './period'
import { groupByDay } from './wallet-model'

const PAGE_SIZE = 50
const chipClass =
  'h-8 min-w-0 rounded-full border bg-background px-3 text-sm text-foreground'
const signed = (t: Transaction) =>
  `${t.type === 'income' ? '+' : '−'}${formatBalance(t.amount)}`
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-BE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
const money = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatBalance(Math.abs(value).toFixed(2))}`

/** Color of each category: the color of its top-level ancestor. */
function categoryColors(categories: Category[]) {
  const roots = rootColors(categories)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const colors = new Map<string, string>()
  for (const category of categories) {
    let node: Category | undefined = category
    while (node?.parent_id) node = byId.get(node.parent_id)
    colors.set(category.id, (node && roots.get(node.id)) ?? '#94a3b8')
  }
  return colors
}

/** Movements of one wallet over a period, grouped by day. */
export function WalletTransactions({
  wallet,
  period,
}: {
  wallet: Wallet
  period: WalletDateRange
}) {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [type, setType] = useState('')
  const [origin, setOrigin] = useState<'all' | 'recurring' | 'manual'>('all')
  const [selected, setSelected] = useState<Transaction | null>(null)
  const [editor, setEditor] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const names = useMemo(
    () => new Map(categories.data?.map((c) => [c.id, c.name])),
    [categories.data],
  )
  const colors = useMemo(
    () => categoryColors(categories.data ?? []),
    [categories.data],
  )

  const filters: TransactionFilters = {
    wallet_id: wallet.id,
    ...period,
    category_id: categoryId,
    type,
    kind: '',
    include_subcategories: true,
    q,
    origin,
  }
  const query = useInfiniteQuery({
    queryKey: [...transactionKeys.all, 'wallet-list', filters],
    queryFn: ({ pageParam, signal }) =>
      listTransactions(pageParam, filters, signal, PAGE_SIZE),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.pagination.page < last.pagination.total_pages
        ? last.pagination.page + 1
        : undefined,
  })
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  )
  const groups = useMemo(() => groupByDay(items), [items])
  const first = query.data?.pages[0]
  const filtered = !!(q || categoryId || type || origin !== 'all')

  // Loads the next page when the end of the list comes into view.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    const end = endRef.current
    if (!end || !hasNextPage) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) void fetchNextPage()
      },
      { root: listRef.current, rootMargin: '200px' },
    )
    observer.observe(end)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, items.length])

  // Keeps the open detail in sync after an edit.
  const current = selected
    ? (items.find((item) => item.id === selected.id) ?? selected)
    : null

  return (
    <section
      className="flex flex-col gap-3 lg:min-h-0 lg:flex-1"
      aria-label="Transactions de la période"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-40 flex-1">
          <span className="sr-only">Rechercher un libellé</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="wallet-transaction-search"
            type="search"
            value={search}
            placeholder="Rechercher…"
            className={cn(chipClass, 'w-full pl-8')}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className="w-48 [&_input]:h-8 [&_input]:rounded-full">
          <CategorySearch
            id="wallet-category-filter"
            value={categoryId}
            onChange={setCategoryId}
            categories={categories.data ?? []}
            placeholder="Catégorie"
          />
        </div>
        <select
          id="wallet-type-filter"
          aria-label="Type"
          className={cn(chipClass, type && 'border-primary')}
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">Dépenses et rentrées</option>
          <option value="expense">Dépenses</option>
          <option value="income">Rentrées</option>
        </select>
        <select
          id="wallet-origin-filter"
          aria-label="Origine"
          className={cn(chipClass, origin !== 'all' && 'border-primary')}
          value={origin}
          onChange={(event) => setOrigin(event.target.value as typeof origin)}
        >
          <option value="all">Fixes et variables</option>
          <option value="recurring">Fixes</option>
          <option value="manual">Variables</option>
        </select>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('')
              setQ('')
              setCategoryId('')
              setType('')
              setOrigin('all')
            }}
          >
            <X aria-hidden="true" />
            Effacer
          </Button>
        )}
      </div>

      <div
        ref={listRef}
        className="min-h-40 overflow-y-auto rounded-xl border bg-card lg:min-h-0 lg:flex-1"
      >
        {query.isPending ? (
          <p role="status" className="py-10 text-center text-muted-foreground">
            Chargement des transactions…
          </p>
        ) : query.isError ? (
          <div className="space-y-3 p-6">
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-medium">
              {filtered
                ? 'Aucun mouvement ne correspond aux filtres'
                : 'Aucun mouvement sur cette période'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered
                ? 'Effacez ou changez les filtres.'
                : 'Changez la période ou ajoutez une transaction.'}
            </p>
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.date} aria-label={longDate(group.date)}>
                <h3 className="sticky top-0 z-10 flex justify-between border-b bg-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  <span className="capitalize">{dayLabel(group.date)}</span>
                  <span className="tabular-nums">{money(group.net)}</span>
                </h3>
                <ul className="divide-y">
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
                          current?.id === item.id && 'bg-muted/50',
                        )}
                        onClick={() => setSelected(item)}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full"
                          style={{
                            background: item.category_id
                              ? colors.get(item.category_id)
                              : 'var(--muted-foreground)',
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {item.label}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.kind === 'opening_balance'
                              ? 'Solde initial'
                              : item.category_id
                                ? (names.get(item.category_id) ?? '…')
                                : 'Sans catégorie'}
                          </span>
                        </span>
                        {item.recurrence_id && (
                          <Repeat
                            className="size-3.5 shrink-0 text-muted-foreground"
                            aria-label="Récurrente"
                          />
                        )}
                        <span
                          className={cn(
                            'shrink-0 text-sm font-medium tabular-nums',
                            item.type === 'income' &&
                              'text-emerald-600 dark:text-emerald-400',
                          )}
                        >
                          {signed(item)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div ref={endRef} className="h-px" />
            {query.isFetchingNextPage && (
              <p
                role="status"
                className="py-3 text-center text-xs text-muted-foreground"
              >
                Chargement de la suite…
              </p>
            )}
          </>
        )}
      </div>

      {first && first.pagination.total > 0 && (
        <p className="flex shrink-0 justify-between px-1 text-sm text-muted-foreground">
          <span>
            {first.pagination.total} mouvement
            {first.pagination.total > 1 ? 's' : ''}
            {filtered ? ' filtrés' : ''}
          </span>
          {first.net !== undefined && (
            <span
              className={cn(
                'font-medium tabular-nums',
                Number(first.net) < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {money(Number(first.net))}
            </span>
          )}
        </p>
      )}
      <p
        role="status"
        className={notice ? 'text-sm text-muted-foreground' : 'sr-only'}
      >
        {notice}
      </p>

      <Sheet
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        <SheetContent className="w-full sm:max-w-md">
          {current && (
            <>
              <SheetHeader>
                <SheetTitle>{current.label}</SheetTitle>
                <SheetDescription className="capitalize">
                  {longDate(current.date)}
                </SheetDescription>
              </SheetHeader>
              <div className="grid gap-5 px-4">
                <p
                  className={cn(
                    'text-3xl font-semibold tabular-nums',
                    current.type === 'income' &&
                      'text-emerald-600 dark:text-emerald-400',
                  )}
                >
                  {signed(current)}
                  <span className="ml-1 text-lg text-muted-foreground">€</span>
                </p>
                <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Catégorie</dt>
                  <dd className="flex items-center gap-2">
                    {current.category_id && (
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ background: colors.get(current.category_id) }}
                      />
                    )}
                    {current.kind === 'opening_balance'
                      ? 'Solde initial'
                      : current.category_id
                        ? names.get(current.category_id)
                        : 'Sans catégorie'}
                  </dd>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd>{current.type === 'income' ? 'Rentrée' : 'Dépense'}</dd>
                  <dt className="text-muted-foreground">Origine</dt>
                  <dd>
                    {current.recurrence_id
                      ? 'Fixe (récurrence)'
                      : 'Variable (saisie)'}
                  </dd>
                  {current.note && (
                    <>
                      <dt className="text-muted-foreground">Note</dt>
                      <dd className="whitespace-pre-wrap">{current.note}</dd>
                    </>
                  )}
                </dl>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    disabled={
                      !categories.isSuccess &&
                      current.kind !== 'opening_balance'
                    }
                    onClick={() => setEditor(current)}
                  >
                    <Pencil aria-hidden="true" />
                    Modifier
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleting(current)}
                  >
                    <Trash2 aria-hidden="true" />
                    Supprimer
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
              {editor?.kind === 'opening_balance'
                ? 'Modifier le solde initial'
                : 'Modifier la transaction'}
            </DialogTitle>
            <DialogDescription>
              Portefeuille : {wallet.name}. Le solde sera mis à jour à
              l’enregistrement.
            </DialogDescription>
          </DialogHeader>
          {editor &&
            (categories.isSuccess || editor.kind === 'opening_balance') && (
              <TransactionForm
                key={editor.id}
                transaction={editor}
                initialCategoryId=""
                wallets={[wallet]}
                categories={categories.data ?? []}
                lockedWallet
                initialWalletId={wallet.id}
                onBusy={setBusy}
                onCancel={() => setEditor(null)}
                onSaved={() => {
                  setEditor(null)
                  setBusy(false)
                  setNotice('Le mouvement a été enregistré.')
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
            setSelected(null)
            setNotice('Le mouvement a été supprimé.')
          }}
        />
      )}
    </section>
  )
}
