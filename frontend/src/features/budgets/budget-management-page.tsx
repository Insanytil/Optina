import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, Copy, Pencil, Plus, Target, Trash2 } from 'lucide-react'
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
import {
  budgetKeys,
  deleteBudget,
  loadBudgetDefinition,
  loadBudgetDefinitions,
  type BudgetDefinition,
} from './api'
import { BudgetForm } from './budget-form'
import { periodLabels } from './periods'
import { formatDay } from './presentation'

export function BudgetManagementPage({
  editId,
  create,
  duplicate,
}: {
  editId?: string
  create?: boolean
  duplicate?: boolean
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<BudgetDefinition | null>(null)
  const [notice, setNotice] = useState('')
  const goals = useQuery({
    queryKey: [...budgetKeys.all, 'definitions', page],
    queryFn: ({ signal }) => loadBudgetDefinitions(page, signal),
  })
  const selected = useQuery({
    queryKey: [...budgetKeys.all, 'definition', editId],
    queryFn: ({ signal }) => loadBudgetDefinition(editId!, signal),
    enabled: !!editId,
  })
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const open = !!editId || !!create
  function close() {
    if (!busy)
      void navigate({ to: '/settings/budgets', search: {}, replace: true })
  }
  function edit(goal: BudgetDefinition, clone = false) {
    void navigate({
      to: '/settings/budgets',
      search: { edit: goal.id, duplicate: clone || undefined },
    })
  }
  const remove = useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: async () => {
      setDeleting(null)
      setNotice(
        'Budget supprimé. Vos transactions et récurrences sont conservées.',
      )
      if (goals.data?.items.length === 1 && page > 1) setPage(page - 1)
      await client.invalidateQueries({ queryKey: budgetKeys.all })
    },
  })
  const categoryName = (id: string) =>
    categories.data?.find((category) => category.id === id)?.name ?? 'Catégorie'
  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Paramétrage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Budgets de dépenses
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Définissez vos montants de référence, les périodes et les dépenses à
            suivre. Retrouvez leurs résultats dans le suivi des budgets.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            onClick={() => void navigate({ to: '/budgets' })}
          >
            <ArrowUpRight aria-hidden="true" />
            Voir le suivi
          </Button>
          <Button
            className="min-h-11"
            disabled={!wallets.data?.length}
            onClick={() =>
              void navigate({
                to: '/settings/budgets',
                search: { create: true },
              })
            }
          >
            <Plus aria-hidden="true" />
            Nouveau budget
          </Button>
        </div>
      </header>
      <p
        role="status"
        className={
          notice ? 'rounded-lg border bg-muted/30 p-3 text-sm' : 'sr-only'
        }
      >
        {notice}
      </p>
      {(categories.error || wallets.error) && (
        <p role="alert" className="text-sm text-destructive">
          {categories.error?.message ?? wallets.error?.message}
        </p>
      )}
      {wallets.isSuccess && !wallets.data.length && (
        <div className="rounded-xl border p-5">
          <p className="text-sm">
            Créez un portefeuille pour commencer à définir vos budgets.
          </p>
          <Button
            variant="outline"
            className="mt-3 min-h-10"
            onClick={() => void navigate({ to: '/wallets' })}
          >
            Gérer mes portefeuilles
          </Button>
        </div>
      )}
      {goals.isPending ? (
        <p
          role="status"
          className="py-12 text-center text-sm text-muted-foreground"
        >
          Chargement des budgets…
        </p>
      ) : goals.isError ? (
        <div role="alert">
          <p>{goals.error.message}</p>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => void goals.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : !goals.data.items.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Target
            className="mx-auto mb-3 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-semibold">Votre premier budget</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Par exemple : un budget mensuel pour l’alimentation ou annuel pour
            les vacances. Un dépassement ne bloque aucune dépense.
          </p>
          <Button
            className="mt-5 min-h-11"
            disabled={!wallets.data?.length}
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
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">
              Tous mes budgets{' '}
              <span className="text-sm font-normal text-muted-foreground">
                ({goals.data.pagination.total})
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Une ligne par budget ponctuel ou répétitif
            </p>
          </div>
          <div className="divide-y rounded-xl border bg-card">
            {goals.data.items.map((goal) => (
              <article
                key={goal.id}
                className="flex flex-wrap items-center justify-between gap-4 p-5"
              >
                <div className="min-w-0 flex-1 basis-64">
                  <p className="text-xs text-muted-foreground">
                    {categoryName(goal.category_id)} ·{' '}
                    {periodLabels[goal.period_type]}
                  </p>
                  <h3 className="mt-1 break-words font-semibold">
                    {goal.name}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {goal.repeats
                      ? `Répétitif · Depuis le ${formatDay(goal.series_start ?? goal.date_from)}${goal.repeat_until ? ` · Jusqu’au ${formatDay(goal.repeat_until)}` : ' · Sans fin'}`
                      : `${formatDay(goal.date_from)} — ${formatDay(goal.date_to)}`}
                  </p>
                  <p className="mt-2 break-words text-xs text-muted-foreground">
                    {goal.wallet_ids
                      .map(
                        (id) =>
                          wallets.data?.find((wallet) => wallet.id === id)
                            ?.name ?? 'Portefeuille',
                      )
                      .join(' · ')}
                  </p>
                </div>
                <div className="space-y-1 sm:text-right">
                  <p className="text-xs text-muted-foreground">
                    Montant de référence
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBalance(goal.amount)}
                  </p>
                  {goal.repeats && (
                    <p className="text-xs text-muted-foreground">
                      Période du {formatDay(goal.date_from)}
                      {goal.is_override ? ' · Exception' : ''}
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-wrap gap-1 sm:w-auto">
                  <Button
                    variant="outline"
                    className="min-h-10"
                    aria-label={`Modifier ${goal.name}`}
                    onClick={() => edit(goal)}
                  >
                    <Pencil aria-hidden="true" />
                    Modifier
                  </Button>
                  {!goal.repeats && (
                    <Button
                      variant="ghost"
                      className="min-h-10"
                      aria-label={`Dupliquer ${goal.name} vers la période suivante`}
                      onClick={() => edit(goal, true)}
                    >
                      <Copy aria-hidden="true" />
                      Dupliquer
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-destructive"
                    aria-label={`Supprimer ${goal.name}`}
                    onClick={() => {
                      remove.reset()
                      setDeleting(goal)
                    }}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {goals.data.pagination.total_pages > 1 && (
            <nav
              className="flex items-center justify-center gap-3"
              aria-label="Pagination des budgets"
            >
              <Button
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Précédent
              </Button>
              <span className="text-sm">
                Page {page} sur {goals.data.pagination.total_pages}
              </span>
              <Button
                variant="outline"
                disabled={page >= goals.data.pagination.total_pages}
                onClick={() => setPage(page + 1)}
              >
                Suivant
              </Button>
            </nav>
          )}
        </>
      )}
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!value) close()
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {duplicate
                ? 'Créer la période suivante'
                : editId
                  ? 'Modifier le budget'
                  : 'Nouveau budget'}
            </DialogTitle>
            <DialogDescription>
              {selected.data?.repeats && !duplicate
                ? `Période du ${formatDay(selected.data.date_from)} au ${formatDay(selected.data.date_to)}. Choisissez si vos changements concernent cette période uniquement ou aussi les suivantes.`
                : 'Choisissez les dépenses à suivre, leur période et un montant de référence.'}
            </DialogDescription>
          </DialogHeader>
          {editId && selected.isPending ? (
            <p role="status">Chargement du budget…</p>
          ) : editId && selected.isError ? (
            <div role="alert">
              <p>{selected.error.message}</p>
              <Button
                variant="outline"
                className="mt-3"
                onClick={() => void selected.refetch()}
              >
                Réessayer
              </Button>
            </div>
          ) : (
            (!editId || selected.data) && (
              <BudgetForm
                key={`${editId ?? 'new'}-${!!duplicate}`}
                budget={selected.data}
                duplicate={duplicate}
                anchor={localToday()}
                onBusy={setBusy}
                onSaved={() =>
                  setNotice(
                    'Budget enregistré. Consultez le suivi pour visualiser vos dépenses.',
                  )
                }
                onClose={() =>
                  void navigate({
                    to: '/settings/budgets',
                    search: {},
                    replace: true,
                  })
                }
              />
            )
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(value) => {
          if (!value && !remove.isPending) setDeleting(null)
        }}
      >
        <DialogContent showCloseButton={!remove.isPending}>
          <DialogHeader>
            <DialogTitle>Supprimer « {deleting?.name} » ?</DialogTitle>
            <DialogDescription>
              {deleting?.repeats
                ? 'Ce budget répétitif et toutes ses périodes de suivi seront supprimés. Vos transactions et récurrences seront conservées.'
                : 'Seul ce budget sera supprimé. Vos transactions et récurrences seront conservées.'}
            </DialogDescription>
          </DialogHeader>
          {remove.error && <p role="alert">{remove.error.message}</p>}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => setDeleting(null)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              Supprimer le budget
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
