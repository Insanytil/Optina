import { useCallback, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChartNoAxesColumn,
  MoreHorizontal,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { walletColors } from '@/features/calendar/calendar-model'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { categoryPaths } from '@/features/categories/category-paths'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { formatBalance } from '@/features/wallets/api'
import { budgetKeys, deleteBudget, loadBudgets } from './api'
import type { Budget } from './api'
import { BudgetForm } from './budget-form'
import {
  amountOn,
  frequencyLabels,
  futureAmounts,
  shortDate,
  todayIso,
} from './budget-model'

type Editor = Budget | 'new'

const COLS =
  'grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-3 md:grid-cols-[minmax(0,1fr)_9rem_9rem_minmax(0,10rem)_2rem]'

export function BudgetSettingsPage() {
  const client = useQueryClient()
  const budgets = useQuery({
    queryKey: budgetKeys.list,
    queryFn: ({ signal }) => loadBudgets(signal),
  })
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const walletOptions = (wallets.data ?? []).map((wallet) => ({
    ...wallet,
    color: walletColors(wallets.data ?? []).get(wallet.id),
  }))
  const paths = categoryPaths(categories.data ?? [])
  const today = todayIso()

  const [editor, setEditor] = useState<Editor | null>(null)
  const [pending, setPending] = useState<Editor | null | false>(false)
  const [deleting, setDeleting] = useState<Budget | null>(null)
  const [notice, setNotice] = useState('')
  const dirty = useRef(false)
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  /** Opens, switches or closes the editor, asking first if edits would be lost. */
  function goTo(next: Editor | null) {
    if (dirty.current) {
      setPending(next)
      return
    }
    setNotice('')
    setEditor(next)
  }

  const removal = useMutation({
    mutationFn: (budget: Budget) => deleteBudget(budget.id),
    onSuccess: async (_, budget) => {
      setDeleting(null)
      dirty.current = false
      setEditor(null)
      setNotice(`Le budget « ${budget.name} » a été supprimé.`)
      await client.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })

  const ready = categories.data && wallets.data
  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            Paramétrage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Budgets de dépenses
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Un montant de référence par catégorie. Un dépassement ne bloque
            aucune dépense.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/budgets" />}
          >
            <ChartNoAxesColumn aria-hidden="true" />
            Voir le suivi
          </Button>
          <Button disabled={!ready} onClick={() => goTo('new')}>
            <Plus aria-hidden="true" />
            Nouveau budget
          </Button>
        </div>
      </header>

      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {budgets.isPending ? (
        <p role="status">Chargement…</p>
      ) : budgets.isError ? (
        <p role="alert">{budgets.error.message}</p>
      ) : budgets.data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Target
            className="mx-auto mb-3 size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <p>Aucun budget pour l’instant.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Par exemple : 400 € par mois pour les courses, ou 1 200 € pour les
            vacances de juillet.
          </p>
          <Button
            className="mt-4"
            disabled={!ready}
            onClick={() => goTo('new')}
          >
            <Plus aria-hidden="true" />
            Créer un budget
          </Button>
        </div>
      ) : (
        <div className="overflow-clip rounded-xl border bg-card text-sm">
          <div
            className={`${COLS} bg-muted px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase`}
          >
            <span>Nom</span>
            <span className="hidden md:block">Fréquence</span>
            <span className="text-right md:text-left">Montant</span>
            <span className="hidden md:block">Portefeuilles</span>
            <span className="sr-only">Actions</span>
          </div>
          <ul>
            {budgets.data.map((budget) => {
              const next = futureAmounts(budget, today).at(0)
              const ended = budget.end_date !== null && budget.end_date < today
              return (
                <li
                  key={budget.id}
                  className={`${COLS} group relative border-t px-4 py-2.5 hover:bg-muted/40 ${ended ? 'text-muted-foreground' : ''}`}
                >
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => goTo(budget)}
                      className="block max-w-full truncate rounded-sm text-left font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                    >
                      {budget.name}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {paths.get(budget.category_id) ?? 'Catégorie'}
                      <span className="md:hidden">
                        {' · '}
                        {frequencyLabels[budget.frequency]}
                      </span>
                      {ended && ' · terminé'}
                      {budget.start_date > today &&
                        ` · commence le ${shortDate(budget.start_date)}`}
                    </p>
                  </div>
                  <span className="hidden text-muted-foreground md:block">
                    {budget.frequency === 'once'
                      ? `Du ${shortDate(budget.start_date)} au ${shortDate(budget.end_date ?? budget.start_date)}`
                      : frequencyLabels[budget.frequency]}
                    {budget.carry_over && (
                      <span className="block text-xs">avec report</span>
                    )}
                  </span>
                  <span className="text-right tabular-nums md:text-left">
                    <span className="font-medium">
                      {formatBalance(amountOn(budget, today))}
                    </span>
                    {next && (
                      <span className="block text-xs text-muted-foreground">
                        {formatBalance(next.amount)} dès le{' '}
                        {shortDate(next.effective_from)}
                      </span>
                    )}
                  </span>
                  <span className="hidden min-w-0 flex-wrap gap-x-2 md:flex">
                    {budget.wallet_ids.length === walletOptions.length ? (
                      <span className="text-muted-foreground">Tous</span>
                    ) : (
                      walletOptions
                        .filter((wallet) =>
                          budget.wallet_ids.includes(wallet.id),
                        )
                        .map((wallet) => (
                          <span
                            key={wallet.id}
                            className="inline-flex min-w-0 items-center gap-1"
                          >
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: wallet.color }}
                            />
                            <span className="truncate">{wallet.name}</span>
                          </span>
                        ))
                    )}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="relative z-10 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[popup-open]:opacity-100"
                          aria-label={`Actions pour ${budget.name}`}
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => goTo(budget)}>
                        <Pencil />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          removal.reset()
                          setDeleting(budget)
                        }}
                      >
                        <Trash2 />
                        Supprimer…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) goTo(null)
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="gap-0.5 border-b px-5 py-4">
            <SheetDescription className="truncate text-xs">
              {editor && editor !== 'new'
                ? (paths.get(editor.category_id) ?? 'Budget')
                : 'Budget de dépenses'}
            </SheetDescription>
            <SheetTitle className="truncate pr-8 text-lg">
              {editor === 'new' ? 'Nouveau budget' : editor?.name}
            </SheetTitle>
          </SheetHeader>
          {editor && ready && (
            <BudgetForm
              key={editor === 'new' ? 'new' : editor.id}
              budget={editor === 'new' ? undefined : editor}
              categories={categories.data}
              wallets={walletOptions}
              onDirtyChange={onDirtyChange}
              onCancel={() => goTo(null)}
              onDelete={
                editor === 'new'
                  ? undefined
                  : () => {
                      removal.reset()
                      setDeleting(editor)
                    }
              }
              onSaved={(saved) => {
                setEditor(null)
                setNotice(
                  `Le budget « ${saved.name} » a été ${editor === 'new' ? 'créé' : 'enregistré'}.`,
                )
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pending !== false}
        onOpenChange={(open) => {
          if (!open) setPending(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les changements de ce budget n’ont pas été enregistrés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer la modification</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                dirty.current = false
                if (pending !== false) setEditor(pending)
                setPending(false)
              }}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !removal.isPending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer « {deleting?.name} » ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Le budget et son historique disparaissent. Les transactions sont
              conservées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removal.error && (
            <p role="alert" className="text-sm text-destructive">
              {removal.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removal.isPending}>
              Annuler
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={removal.isPending}
              onClick={() => deleting && removal.mutate(deleting)}
            >
              {removal.isPending ? 'Suppression…' : 'Supprimer'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
