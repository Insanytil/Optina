import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Category } from '@/features/categories/api'
import { CategorySearch } from '@/features/categories/category-search'
import type { WalletOption } from '@/features/calendar/calendar-model'
import { cn } from 'cn'
import { budgetKeys, saveBudget } from './api'
import type { Budget, BudgetValues, Frequency } from './api'
import {
  frequencyLabels,
  normalizeAmount,
  todayIso,
  validAmount,
} from './budget-model'

const FREQUENCIES: Frequency[] = ['week', 'month', 'quarter', 'year', 'once']
const SHORT: Record<Frequency, string> = {
  week: 'Semaine',
  month: 'Mois',
  quarter: 'Trimestre',
  year: 'Année',
  once: 'Une fois',
}
const START_HELP: Record<Frequency, string> = {
  week: 'Le budget commence le lundi de cette semaine.',
  month: 'Le budget commence le 1er de ce mois.',
  quarter: 'Le budget commence au début de ce trimestre.',
  year: 'Le budget commence le 1er janvier de cette année.',
  once: '',
}

interface Draft extends Omit<BudgetValues, 'amounts' | 'alert_threshold'> {
  amount: string
  changes: { effective_from: string; amount: string }[]
  alert_threshold: string
}

function toDraft(budget: Budget | undefined, wallets: WalletOption[]): Draft {
  const first = budget?.amounts.at(0)
  const changes = budget?.amounts.slice(1) ?? []
  return {
    name: budget?.name ?? '',
    category_id: budget?.category_id ?? '',
    wallet_ids: budget?.wallet_ids ?? wallets.map((wallet) => wallet.id),
    frequency: budget?.frequency ?? 'month',
    start_date: budget?.start_date ?? `${todayIso().slice(0, 7)}-01`,
    end_date: budget?.end_date ?? null,
    amount: first?.amount ?? '',
    changes,
    carry_over: budget?.carry_over ?? false,
    alert_threshold: String(budget?.alert_threshold ?? 80),
  }
}

/** Create or edit a budget; lives in the settings page's side sheet. */
export function BudgetForm({
  budget,
  categories,
  wallets,
  onSaved,
  onCancel,
  onDelete,
  onDirtyChange,
}: {
  budget?: Budget
  categories: Category[]
  wallets: WalletOption[]
  onSaved: (budget: Budget) => void
  onCancel: () => void
  onDelete?: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const client = useQueryClient()
  const [initial] = useState(() => toDraft(budget, wallets))
  const [draft, setDraft] = useState(initial)
  const set = (changes: Partial<Draft>) => setDraft({ ...draft, ...changes })
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const once = draft.frequency === 'once'
  const threshold = Number(draft.alert_threshold)
  const problems = [
    !draft.name.trim() && 'Donnez un nom au budget.',
    !draft.category_id && 'Choisissez une catégorie.',
    !draft.wallet_ids.length && 'Choisissez au moins un portefeuille.',
    !validAmount(draft.amount) && 'Saisissez un montant positif.',
    once && !draft.end_date && 'Choisissez la date de fin.',
    draft.end_date &&
      draft.end_date < draft.start_date &&
      'La fin doit suivre le début.',
    !once &&
      draft.changes.some(
        (row) => !row.effective_from || !validAmount(row.amount),
      ) &&
      'Complétez ou retirez chaque changement de montant.',
    !(Number.isInteger(threshold) && threshold >= 1 && threshold <= 200) &&
      'Le seuil d’alerte va de 1 à 200 %.',
  ].filter(Boolean) as string[]

  const mutation = useMutation({
    mutationFn: () =>
      saveBudget(
        {
          name: draft.name.trim(),
          category_id: draft.category_id,
          wallet_ids: draft.wallet_ids,
          frequency: draft.frequency,
          start_date: draft.start_date,
          end_date: draft.end_date || null,
          amounts: [
            {
              effective_from: draft.start_date,
              amount: normalizeAmount(draft.amount),
            },
            ...(once ? [] : draft.changes).map((row) => ({
              effective_from: row.effective_from,
              amount: normalizeAmount(row.amount),
            })),
          ],
          carry_over: !once && draft.carry_over,
          alert_threshold: threshold,
        },
        budget?.id,
      ),
    onSuccess: async (saved) => {
      onDirtyChange(false)
      await client.invalidateQueries({ queryKey: budgetKeys.all })
      onSaved(saved)
    },
  })

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        if (!problems.length) mutation.mutate()
      }}
    >
      <fieldset
        disabled={mutation.isPending}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4"
      >
        <div className="space-y-1.5">
          <Label htmlFor="budget-category">Catégorie</Label>
          <CategorySearch
            id="budget-category"
            value={draft.category_id}
            onChange={(category_id) => {
              // Name the budget after its category until the user names it.
              const previous = categories.find(
                (item) => item.id === draft.category_id,
              )?.name
              const next = categories.find((item) => item.id === category_id)
              set({
                category_id,
                name:
                  !draft.name || draft.name === previous
                    ? (next?.name ?? draft.name)
                    : draft.name,
              })
            }}
            categories={categories}
            placeholder="Choisir une catégorie…"
            clearLabel="Effacer la catégorie"
          />
          <p className="text-xs text-muted-foreground">
            Ses sous-catégories sont comptées aussi.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-name">Nom</Label>
          <Input
            id="budget-name"
            maxLength={255}
            value={draft.name}
            onChange={(event) => set({ name: event.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <span id="budget-frequency" className="text-sm font-medium">
            Fréquence
          </span>
          <div
            role="radiogroup"
            aria-labelledby="budget-frequency"
            className="flex flex-wrap overflow-hidden rounded-md border"
          >
            {FREQUENCIES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={draft.frequency === value}
                onClick={() =>
                  set({
                    frequency: value,
                    end_date: value === 'once' ? draft.end_date : null,
                  })
                }
                className={cn(
                  'flex-1 px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                  draft.frequency === value &&
                    'bg-muted font-medium text-foreground',
                )}
              >
                {SHORT[value]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="budget-start">{once ? 'Du' : 'À partir du'}</Label>
            <Input
              id="budget-start"
              type="date"
              required
              value={draft.start_date}
              onChange={(event) => set({ start_date: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget-end">
              {once ? 'Au' : 'Jusqu’au (facultatif)'}
            </Label>
            <Input
              id="budget-end"
              type="date"
              required={once}
              min={draft.start_date}
              value={draft.end_date ?? ''}
              onChange={(event) =>
                set({ end_date: event.target.value || null })
              }
            />
          </div>
          {!once && (
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
              {START_HELP[draft.frequency]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-amount">
            {once
              ? 'Montant'
              : `Montant ${frequencyLabels[draft.frequency].toLowerCase().replace('chaque ', 'par ')}`}
          </Label>
          <Input
            id="budget-amount"
            inputMode="decimal"
            placeholder="0,00"
            value={draft.amount}
            onChange={(event) => set({ amount: event.target.value })}
          />
        </div>

        {!once && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Changements de montant
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  set({
                    changes: [
                      ...draft.changes,
                      { effective_from: '', amount: draft.amount },
                    ],
                  })
                }
              >
                <Plus aria-hidden="true" />
                Ajouter
              </Button>
            </div>
            {draft.changes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Pour changer le montant sans toucher aux périodes passées, par
                exemple « 450 € à partir de janvier ».
              </p>
            ) : (
              <ul className="space-y-2">
                {draft.changes.map((row, index) => (
                  <li key={index} className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <Label
                        htmlFor={`budget-change-date-${index}`}
                        className="text-xs"
                      >
                        À partir du
                      </Label>
                      <Input
                        id={`budget-change-date-${index}`}
                        type="date"
                        min={draft.start_date}
                        value={row.effective_from}
                        onChange={(event) =>
                          set({
                            changes: draft.changes.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    effective_from: event.target.value,
                                  }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                    <div className="w-28 space-y-1">
                      <Label
                        htmlFor={`budget-change-amount-${index}`}
                        className="text-xs"
                      >
                        Montant
                      </Label>
                      <Input
                        id={`budget-change-amount-${index}`}
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(event) =>
                          set({
                            changes: draft.changes.map((item, i) =>
                              i === index
                                ? { ...item, amount: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Retirer ce changement"
                      onClick={() =>
                        set({
                          changes: draft.changes.filter((_, i) => i !== index),
                        })
                      }
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="space-y-1.5">
          <span className="text-sm font-medium">Portefeuilles</span>
          <div className="flex flex-wrap gap-1.5">
            {wallets.map((wallet) => {
              const on = draft.wallet_ids.includes(wallet.id)
              return (
                <button
                  key={wallet.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      wallet_ids: on
                        ? draft.wallet_ids.filter((id) => id !== wallet.id)
                        : [...draft.wallet_ids, wallet.id],
                    })
                  }
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm focus-visible:outline-2',
                    on
                      ? 'border-foreground/30 bg-muted font-medium'
                      : 'text-muted-foreground',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('size-2 rounded-full', !on && 'opacity-40')}
                    style={{ backgroundColor: wallet.color }}
                  />
                  {wallet.name}
                </button>
              )
            })}
          </div>
        </div>

        {!once && (
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="budget-carry">Reporter le reste</Label>
              <p className="text-xs text-muted-foreground">
                Ce qui reste s’ajoute à la période suivante ; un dépassement la
                réduit.
              </p>
            </div>
            <Switch
              id="budget-carry"
              checked={draft.carry_over}
              onCheckedChange={(carry_over) => set({ carry_over })}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="budget-threshold">M’alerter à</Label>
            <p className="text-xs text-muted-foreground">
              Dépensé et encore prévu compris.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              id="budget-threshold"
              inputMode="numeric"
              className="w-16 text-right"
              value={draft.alert_threshold}
              onChange={(event) =>
                set({ alert_threshold: event.target.value.replace(/\D/g, '') })
              }
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
      </fieldset>
      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={mutation.isPending}
            onClick={onDelete}
          >
            <Trash2 aria-hidden="true" />
            Supprimer
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending || problems.length > 0}
            title={problems[0]}
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
