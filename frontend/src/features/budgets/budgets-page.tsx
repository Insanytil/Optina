import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Settings2, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { localToday } from '@/features/transactions/form-values'
import { formatBalance } from '@/features/wallets/api'
import { BudgetTransactions } from './budget-transactions'
import { BudgetHistory } from './budget-history'
import { GoalCard } from './goal-card'
import { ViewToolbar } from './view-toolbar'
import { ViewSettings } from './view-settings'
import { SaveViewDialog } from './save-view-dialog'
import {
  budgetKeys,
  loadBudgets,
  loadViews,
  deleteView,
  type Budget,
  type SavedView,
  type ViewConfig,
} from './api'
import { addDays, defaultView, filterGoals, validDate } from './periods'
import { formatDay } from './presentation'
function rangeFor(status: ViewConfig['status']) {
  const today = localToday(),
    year = Number(today.slice(0, 4))
  if (status === 'active') return { from: today, to: today }
  if (status === 'upcoming')
    return { from: addDays(today, 1), to: `${year + 1}-12-31` }
  if (status === 'ended')
    return { from: `${year - 1}-01-01`, to: addDays(today, -1) }
  return { from: `${year - 1}-01-01`, to: `${year + 1}-12-31` }
}
export function BudgetsPage() {
  const navigate = useNavigate(),
    client = useQueryClient(),
    initialized = useRef(false)
  const [config, setConfig] = useState<ViewConfig>(() => defaultView())
  const [range, setRange] = useState(() => rangeFor('active'))
  const [viewId, setViewId] = useState(''),
    [savingView, setSavingView] = useState(false),
    [removingView, setRemovingView] = useState(false)
  const [details, setDetails] = useState<Budget | null>(null),
    [history, setHistory] = useState<Budget | null>(null),
    [notice, setNotice] = useState('')
  const views = useQuery({
    queryKey: budgetKeys.views,
    queryFn: ({ signal }) => loadViews(signal),
  })
  function applyView(view: SavedView) {
    setViewId(view.id)
    setConfig(view.config)
    setRange(rangeFor(view.config.status))
    setNotice('')
  }
  useEffect(() => {
    if (!views.data || initialized.current) return
    initialized.current = true
    const view = views.data.find((item) => item.is_default)
    if (view) {
      setViewId(view.id)
      setConfig(view.config)
      setRange(rangeFor(view.config.status))
    }
  }, [views.data])
  const valid =
    validDate(range.from) &&
    validDate(range.to) &&
    range.from <= range.to &&
    (Date.parse(range.to) - Date.parse(range.from)) / 86400000 <= 3660
  const query = useQuery({
    queryKey: budgetKeys.list(range.from, range.to),
    queryFn: ({ signal }) => loadBudgets(range.from, range.to, signal),
    enabled: valid,
  })
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const shown = filterGoals(
    query.data?.items ?? [],
    config,
    query.data?.as_of ?? localToday(),
  )
  const current = views.data?.find((view) => view.id === viewId)
  const remove = useMutation({
    mutationFn: () => deleteView(viewId),
    onSuccess: async () => {
      setRemovingView(false)
      setViewId('')
      setConfig(defaultView())
      setRange(rangeFor('active'))
      await client.invalidateQueries({ queryKey: budgetKeys.views })
    },
  })
  function changeStatus(status: ViewConfig['status']) {
    setConfig((previous) => ({ ...previous, status }))
    setRange(rangeFor(status))
  }
  return (
    <section className="mx-auto max-w-[1500px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Suivi des budgets
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Repérez les budgets en cours et comparez vos dépenses d’une période
            à l’autre.
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          onClick={() => void navigate({ to: '/settings/budgets' })}
        >
          <Settings2 aria-hidden="true" />
          Gérer mes budgets
        </Button>
      </header>
      <ViewToolbar
        status={config.status}
        onStatus={changeStatus}
        from={range.from}
        to={range.to}
        onRange={(from, to) => setRange({ from, to })}
        views={views.data ?? []}
        viewId={viewId}
        onView={(id) => {
          const view = views.data?.find((item) => item.id === id)
          if (view) applyView(view)
          else {
            setViewId('')
            setConfig(defaultView())
            setRange(rangeFor('active'))
          }
        }}
        onSave={() => setSavingView(true)}
        onDelete={() => {
          remove.reset()
          setRemovingView(true)
        }}
        canSave={!views.isPending && !views.isError}
        modified={
          !!current && JSON.stringify(current.config) !== JSON.stringify(config)
        }
      />
      <ViewSettings
        config={config}
        onChange={(next) => {
          if (next.status !== config.status) setRange(rangeFor(next.status))
          setConfig(next)
        }}
        categories={categories.data ?? []}
        wallets={wallets.data ?? []}
        goals={query.data?.items ?? []}
        onReset={() => {
          setConfig(defaultView())
          setRange(rangeFor('active'))
        }}
      />
      <details className="rounded-xl border border-dashed p-4">
        <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2">
          Comment lire mes budgets ?
        </summary>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p>
            Le réalisé correspond aux dépenses enregistrées. Les récurrences
            restantes sont une prévision séparée ; les autres dépenses futures
            ne sont pas estimées.
          </p>
          <p>
            Un budget répétitif repart avec son montant prévu à chaque période.
            Un dépassement ne bloque aucune transaction. Les budgets qui se
            recoupent ne sont jamais additionnés.
          </p>
          <p>
            Dans l’historique, les périodes terminées affichent leur résultat
            final. Une période en cours est incomplète et ne doit pas être
            comparée comme si elle était terminée.
          </p>
        </div>
      </details>
      <p
        role="status"
        className={notice ? 'text-sm text-muted-foreground' : 'sr-only'}
      >
        {notice}
      </p>
      {(views.error || wallets.error || categories.error) && (
        <p role="alert">
          {views.error?.message ??
            wallets.error?.message ??
            categories.error?.message}
        </p>
      )}
      {!valid ? (
        <p role="alert">Choisissez des dates valides sur dix ans au maximum.</p>
      ) : query.isPending ? (
        <p role="status" className="py-12 text-center">
          Chargement des périodes de budget…
        </p>
      ) : query.isError ? (
        <div role="alert">
          <p>{query.error.message}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              {shown.length} période(s) de budget
            </h2>
            <p className="text-xs text-muted-foreground">
              Situation au {formatDay(query.data!.as_of)}
            </p>
          </div>
          {!shown.length ? (
            <div className="rounded-xl border border-dashed p-10 text-center">
              <Target
                className="mx-auto mb-3 size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="font-semibold">
                Aucun budget pour cette sélection
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Ajustez les dates et les filtres, ou définissez un budget
                ponctuel ou répétitif.
              </p>
              <Button
                variant="outline"
                className="mt-5 min-h-11"
                onClick={() =>
                  void navigate({
                    to: '/settings/budgets',
                    search: { create: true },
                  })
                }
              >
                Créer un budget
              </Button>
            </div>
          ) : config.status === 'ended' ? (
            <div className="overflow-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Résultats des périodes terminées
                </caption>
                <thead className="bg-muted/40">
                  <tr>
                    {[
                      'Budget et période',
                      'Montant fixé',
                      'Dépensé',
                      'Résultat',
                      'Détail',
                    ].map((label) => (
                      <th
                        scope="col"
                        key={label}
                        className="whitespace-nowrap p-4 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shown.map((budget) => (
                    <tr key={budget.id}>
                      <th scope="row" className="min-w-56 p-4 font-normal">
                        <strong className="block">{budget.name}</strong>
                        <span className="text-xs text-muted-foreground">
                          {formatDay(budget.date_from)} —{' '}
                          {formatDay(budget.date_to)}
                        </span>
                      </th>
                      <td className="whitespace-nowrap p-4 tabular-nums">
                        {formatBalance(budget.amount)}
                      </td>
                      <td className="whitespace-nowrap p-4 tabular-nums">
                        {formatBalance(budget.spent)}
                      </td>
                      <td className="whitespace-nowrap p-4">
                        {budget.remaining.startsWith('-')
                          ? 'Dépassé'
                          : 'Respecté'}{' '}
                        · {formatBalance(budget.remaining)}
                      </td>
                      <td className="p-4">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void navigate({
                                to: '/settings/budgets',
                                search: { edit: budget.id },
                              })
                            }
                          >
                            Modifier
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setDetails(budget)}
                          >
                            Dépenses
                          </Button>
                          {budget.series_id && (
                            <Button
                              variant="ghost"
                              onClick={() => setHistory(budget)}
                            >
                              Comparer
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {shown.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  category={
                    categories.data?.find(
                      (item) => item.id === goal.category_id,
                    )?.name ?? 'Catégorie'
                  }
                  wallets={wallets.data ?? []}
                  config={config}
                  asOf={query.data!.as_of}
                  onEdit={() =>
                    void navigate({
                      to: '/settings/budgets',
                      search: { edit: goal.id },
                    })
                  }
                  onDetails={() => setDetails(goal)}
                  onHistory={() => setHistory(goal)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {savingView && (
        <SaveViewDialog
          current={current}
          preset="daily"
          config={config}
          first={!views.data?.length}
          onClose={() => setSavingView(false)}
          onSaved={(view) => {
            applyView(view)
            setSavingView(false)
            setNotice('Vue enregistrée.')
          }}
        />
      )}
      <Dialog
        open={removingView}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setRemovingView(false)
        }}
      >
        <DialogContent showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle>Supprimer cette vue ?</DialogTitle>
            <DialogDescription>
              Vos budgets et leurs périodes sont conservés.
            </DialogDescription>
          </DialogHeader>
          {remove.error && <p role="alert">{remove.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setRemovingView(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Supprimer la vue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {details && (
        <BudgetTransactions
          key={details.id}
          budget={details}
          title={details.name}
          categories={categories.data ?? []}
          wallets={wallets.data ?? []}
          onClose={() => setDetails(null)}
        />
      )}
      {history && (
        <BudgetHistory
          key={history.id}
          budget={history}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  )
}
