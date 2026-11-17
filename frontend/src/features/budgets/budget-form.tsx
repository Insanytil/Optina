import { validBudgetAmount } from './budget-progress'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CategorySearch } from '@/features/categories/category-search'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { budgetKeys, saveBudget, type BudgetDefinition } from './api'
import { calendarPeriod, nextPeriod, periodLabels, validDate } from './periods'
import type { PeriodType } from './api'
import { formatDay } from './presentation'

export function BudgetForm({
  budget,
  anchor,
  duplicate = false,
  onClose,
  onBusy,
  onSaved,
}: {
  budget?: BudgetDefinition
  anchor: string
  duplicate?: boolean
  onClose: () => void
  onBusy: (busy: boolean) => void
  onSaved: (goal: BudgetDefinition) => void
}) {
  const client = useQueryClient()
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const initial = budget
    ? duplicate
      ? nextPeriod(budget)
      : { date_from: budget.date_from, date_to: budget.date_to }
    : calendarPeriod('month', anchor)
  const [repeats, setRepeats] = useState(
    duplicate ? false : (budget?.repeats ?? false),
  )
  const [repeatUntil, setRepeatUntil] = useState(budget?.repeat_until ?? '')
  const [scope, setScope] = useState<'period' | 'following'>('period')
  const repeatingEdit = !!budget?.series_id && !duplicate
  const [name, setName] = useState(budget?.name ?? '')
  const [periodType, setPeriodType] = useState<PeriodType>(
    budget?.period_type ?? 'month',
  )
  const [dates, setDates] = useState(initial)
  const periodValid =
    validDate(dates.date_from) &&
    validDate(dates.date_to) &&
    dates.date_from <= dates.date_to &&
    (Date.parse(dates.date_to) - Date.parse(dates.date_from)) / 86400000 <= 3660
  const [categoryId, setCategoryId] = useState(budget?.category_id ?? '')
  const [amount, setAmount] = useState(budget?.amount ?? '')
  const [walletIds, setWalletIds] = useState<string[]>(budget?.wallet_ids ?? [])
  const amountValid = validBudgetAmount(amount)
  const mutation = useMutation({
    mutationFn: () =>
      saveBudget(
        {
          repeats,
          repeat_until: repeats && repeatUntil ? repeatUntil : null,
          category_id: categoryId,
          name:
            name.trim() ||
            categories.data?.find((category) => category.id === categoryId)
              ?.name ||
            'Budget',
          ...dates,
          period_type: periodType,
          amount: amount.replace(',', '.'),
          wallet_ids: walletIds,
        },
        duplicate ? undefined : budget?.id,
        scope,
      ),
    onMutate: () => onBusy(true),
    onSettled: () => onBusy(false),
    onSuccess: async (saved) => {
      await client.invalidateQueries({ queryKey: budgetKeys.all })
      onSaved(saved)
      onClose()
    },
  })
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (
          validBudgetAmount(amount) &&
          categoryId &&
          walletIds.length &&
          periodValid
        )
          mutation.mutate()
      }}
    >
      <fieldset className="space-y-4" disabled={mutation.isPending}>
        {repeatingEdit ? (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <Label htmlFor="budget-edit-scope">
              Appliquer les modifications
            </Label>
            <select
              id="budget-edit-scope"
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as 'period' | 'following')
              }
              className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="period">Cette période uniquement</option>
              <option value="following">
                Cette période et toutes les suivantes
              </option>
            </select>
            <p className="text-xs text-muted-foreground">
              Les périodes précédentes conservent leur montant et leur
              périmètre. Le choix « et les suivantes » remplace aussi les
              exceptions déjà prévues après cette période.
            </p>
          </div>
        ) : (
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Quel type de budget ?
            </legend>
            {[
              {
                value: false,
                label: 'Ponctuel',
                help: 'Pour une période précise : un mois, un projet…',
              },
              {
                value: true,
                label: 'Répétitif',
                help: 'Un nouveau budget pour chaque semaine, mois, trimestre ou année.',
              },
            ].map((option) => (
              <label
                key={String(option.value)}
                className="flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary/50 has-checked:bg-primary/5"
              >
                <input
                  className="mt-1 accent-primary"
                  type="radio"
                  name="budget-repeat"
                  checked={repeats === option.value}
                  disabled={!!budget && !duplicate && option.value}
                  onChange={() => {
                    setRepeats(option.value)
                    if (option.value && periodType === 'custom') {
                      setPeriodType('month')
                      setDates(calendarPeriod('month', anchor))
                    }
                  }}
                />
                <span>
                  <span className="block text-sm font-medium">
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {option.help}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <section className="space-y-4" aria-labelledby="goal-scope-title">
          <h3
            id="goal-scope-title"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span
              className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              aria-hidden="true"
            >
              1
            </span>
            Quelles dépenses suivre ?
          </h3>
          <div className="space-y-2">
            <Label htmlFor="budget-category">Catégorie principale</Label>
            <CategorySearch
              id="budget-category"
              value={categoryId}
              onChange={setCategoryId}
              categories={categories.data ?? []}
              scope={{ rootOnly: true }}
              disabled={mutation.isPending}
              placeholder="Rechercher une catégorie principale…"
              clearLabel="Effacer la catégorie"
            />
            <p className="text-xs text-muted-foreground">
              Toutes les sous-catégories sont incluses dans ce budget.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-name">Nom du budget (facultatif)</Label>
            <Input
              id="goal-name"
              maxLength={255}
              placeholder="Ex. Vacances en famille"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-describedby="goal-name-help"
            />
            <p id="goal-name-help" className="text-xs text-muted-foreground">
              Sans nom, nous utiliserons celui de la catégorie.
            </p>
          </div>
        </section>
        <section
          className="space-y-4 border-t pt-5"
          aria-labelledby="goal-period-title"
        >
          <h3
            id="goal-period-title"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span
              className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              aria-hidden="true"
            >
              2
            </span>
            Sur quelle période ?
          </h3>
          <div className="space-y-2">
            <Label htmlFor="goal-period">Période</Label>
            <select
              id="goal-period"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={periodType}
              disabled={repeatingEdit}
              onChange={(event) => {
                const type = event.target.value as PeriodType
                setPeriodType(type)
                setDates(
                  calendarPeriod(
                    type,
                    validDate(dates.date_from) ? dates.date_from : anchor,
                  ),
                )
              }}
            >
              {Object.entries(periodLabels).map(([key, label]) => (
                <option
                  key={key}
                  value={key}
                  disabled={repeats && key === 'custom'}
                >
                  {label}
                </option>
              ))}
            </select>
          </div>
          {periodType !== 'custom' && !repeatingEdit && (
            <div className="space-y-2">
              <Label htmlFor="goal-anchor">
                {periodType === 'week'
                  ? 'Une date dans la semaine'
                  : periodType === 'month'
                    ? 'Une date dans le mois'
                    : periodType === 'quarter'
                      ? 'Une date dans le trimestre'
                      : 'Une date dans l’année'}
              </Label>
              <Input
                id="goal-anchor"
                type="date"
                min="1900-01-01"
                max="9998-12-31"
                value={dates.date_from}
                onChange={(event) => {
                  if (validDate(event.target.value))
                    setDates(calendarPeriod(periodType, event.target.value))
                }}
              />
            </div>
          )}
          {periodType === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="goal-from">Du</Label>
                <Input
                  id="goal-from"
                  type="date"
                  required
                  min="1900-01-01"
                  max="9998-12-31"
                  readOnly={periodType !== 'custom'}
                  value={dates.date_from}
                  onChange={(event) =>
                    setDates({ ...dates, date_from: event.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="goal-to">Au</Label>
                <Input
                  id="goal-to"
                  type="date"
                  required
                  min={dates.date_from}
                  max="9998-12-31"
                  readOnly={periodType !== 'custom'}
                  value={dates.date_to}
                  onChange={(event) =>
                    setDates({ ...dates, date_to: event.target.value })
                  }
                />
              </div>
            </div>
          )}
          {periodValid && (
            <p className="rounded-lg bg-muted/50 p-3 text-sm">
              Du <strong>{formatDay(dates.date_from)}</strong> au{' '}
              <strong>{formatDay(dates.date_to)}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                {periodType === 'custom'
                  ? 'Une période libre pour un projet ou un besoin ponctuel.'
                  : 'Les dates suivent le calendrier. Cet budget couvre toute cette période.'}
              </span>
            </p>
          )}
          {repeats && (
            <div className="space-y-2">
              <Label htmlFor="budget-until">
                Dernière période (facultative)
              </Label>
              <Input
                id="budget-until"
                type="date"
                value={repeatUntil}
                min={dates.date_to}
                max="9998-12-31"
                disabled={repeatingEdit && scope === 'period'}
                onChange={(event) =>
                  setRepeatUntil(
                    validDate(event.target.value)
                      ? calendarPeriod(periodType, event.target.value).date_to
                      : '',
                  )
                }
              />
              <p className="text-xs text-muted-foreground">
                Choisissez une date dans la dernière période souhaitée ; sa fin
                sera utilisée. Sans date, le budget continue. Aucun montant
                inutilisé n’est reporté.
              </p>
            </div>
          )}
          {!periodValid && (
            <p role="alert" className="text-xs text-destructive">
              Choisissez une période valide de dix ans au maximum.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="budget-amount">
              Quel montant souhaitez-vous viser ?
            </Label>
            <Input
              id="budget-amount"
              aria-invalid={!!amount && !amountValid}
              aria-describedby={
                amount && !amountValid ? 'budget-amount-error' : undefined
              }
              required
              inputMode="decimal"
              pattern="[0-9]+([.,][0-9]{1,2})?"
              value={amount}
              maxLength={20}
              onChange={(event) => setAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Un repère pour la période entière, sans blocage en cas de
              dépassement.
            </p>
            {amount && !amountValid && (
              <p
                id="budget-amount-error"
                role="alert"
                className="text-xs text-destructive"
              >
                Saisissez un montant positif avec au maximum deux décimales et
                17 chiffres avant la virgule.
              </p>
            )}
          </div>
        </section>
        <section
          className="space-y-4 border-t pt-5"
          aria-labelledby="goal-wallets-title"
        >
          <h3
            id="goal-wallets-title"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <span
              className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              aria-hidden="true"
            >
              3
            </span>
            Dans quels portefeuilles ?
          </h3>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Les dépenses de ces portefeuilles seront comptabilisées
            </legend>
            {wallets.isPending ? (
              <p role="status" className="text-sm">
                Chargement…
              </p>
            ) : wallets.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {wallets.error.message}
              </p>
            ) : (
              <>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setWalletIds(wallets.data.map((wallet) => wallet.id))
                    }
                  >
                    Tout sélectionner
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setWalletIds([])}
                  >
                    Tout désélectionner
                  </Button>
                </div>
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border p-3">
                  {wallets.data.map((wallet) => (
                    <label
                      key={wallet.id}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-muted/40 has-checked:bg-primary/5"
                    >
                      <input
                        className="size-4 accent-primary"
                        type="checkbox"
                        checked={walletIds.includes(wallet.id)}
                        onChange={(event) =>
                          setWalletIds(
                            event.target.checked
                              ? [...walletIds, wallet.id]
                              : walletIds.filter((id) => id !== wallet.id),
                          )
                        }
                      />
                      {wallet.name}
                    </label>
                  ))}
                </div>
              </>
            )}
          </fieldset>
          {!walletIds.length && (
            <p className="text-xs text-muted-foreground">
              Sélectionnez au moins un portefeuille pour continuer.
            </p>
          )}
        </section>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        Les budgets peuvent se recouvrir pour suivre plusieurs horizons. Ils
        n’empêchent aucune dépense et ne modifient pas les soldes.
      </p>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={onClose}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          className="min-h-11"
          disabled={
            mutation.isPending ||
            !categoryId ||
            !walletIds.length ||
            !amountValid ||
            !periodValid ||
            wallets.isError ||
            wallets.isPending
          }
        >
          {mutation.isPending
            ? 'Enregistrement…'
            : budget && !duplicate
              ? 'Enregistrer les modifications'
              : 'Créer mon budget'}
        </Button>
      </div>
    </form>
  )
}
