import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Category } from '@/features/categories/api'
import { CategorySearch } from '@/features/categories/category-search'
import { transactionKeys } from '@/features/transactions/api'
import { walletKeys } from '@/features/wallets/api'
import { localToday } from '@/features/transactions/form-values'
import { frequencies, recurrenceKeys, saveRecurrence } from './api'
import type { Recurrence, RecurrenceValues } from './api'

export function RecurrenceForm({
  rule,
  walletId,
  categories,
  onClose,
  onCancel,
  onBusy,
  onDirtyChange,
}: {
  rule?: Recurrence
  walletId: string
  categories: Category[]
  /** Called after a successful save. */
  onClose: () => void
  onCancel: () => void
  onBusy: (busy: boolean) => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const client = useQueryClient()
  const [initial] = useState<RecurrenceValues>(() => ({
    wallet_id: walletId,
    category_id: rule?.category_id ?? '',
    label: rule?.label ?? '',
    type: rule?.type ?? 'expense',
    amount: rule?.amount ?? '',
    note: rule?.note ?? '',
    frequency_unit: rule?.frequency_unit ?? 'month',
    interval: rule?.interval ?? 1,
    start_date: rule?.start_date ?? localToday(),
    end_date: rule?.end_date ?? null,
  }))
  const [values, setValues] = useState(initial)
  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])
  const today = localToday()
  const startDay = Number(values.start_date.slice(8, 10))
  const mutation = useMutation({
    mutationFn: () =>
      saveRecurrence(
        {
          ...values,
          label: values.label.trim(),
          amount: values.amount.replace(',', '.'),
          note: values.note?.trim() || null,
        },
        rule?.id,
      ),
    onSettled: () => onBusy(false),
    onSuccess: async () => {
      await Promise.all(
        [recurrenceKeys.all, walletKeys.all, transactionKeys.all].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      )
      onDirtyChange(false)
      onClose()
    },
  })
  const select = 'h-9 w-full rounded-md border bg-background px-3 text-sm'
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        onBusy(true)
        mutation.mutate()
      }}
    >
      <fieldset
        disabled={mutation.isPending}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
      >
        <div className="space-y-2">
          <Label htmlFor="rec-label">Libellé</Label>
          <Input
            id="rec-label"
            required
            maxLength={255}
            value={values.label}
            onChange={(e) => setValues({ ...values, label: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rec-type">Type</Label>
            <select
              id="rec-type"
              className={select}
              value={values.type}
              onChange={(e) =>
                setValues({
                  ...values,
                  type: e.target.value as RecurrenceValues['type'],
                })
              }
            >
              <option value="expense">Dépense</option>
              <option value="income">Rentrée</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-amount">Montant</Label>
            <Input
              id="rec-amount"
              required
              inputMode="decimal"
              pattern="[0-9]+([.,][0-9]{1,2})?"
              value={values.amount}
              onChange={(e) => setValues({ ...values, amount: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="rec-category">Catégorie</Label>
          <CategorySearch
            id="rec-category"
            value={values.category_id}
            onChange={(category_id) => setValues({ ...values, category_id })}
            categories={categories}
            scope={{ walletId }}
            disabled={mutation.isPending}
            placeholder="Choisir une catégorie…"
            clearLabel="Effacer la catégorie"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rec-frequency">Fréquence</Label>
          <select
            id="rec-frequency"
            className={select}
            value={`${values.frequency_unit}:${values.interval}`}
            onChange={(e) => {
              const [unit, interval] = e.target.value.split(':')
              setValues({
                ...values,
                frequency_unit: unit as RecurrenceValues['frequency_unit'],
                interval: Number(interval),
              })
            }}
          >
            {!frequencies.some(
              (f) =>
                f.unit === values.frequency_unit &&
                f.interval === values.interval,
            ) && (
              <option value={`${values.frequency_unit}:${values.interval}`}>
                Fréquence personnalisée ({values.interval})
              </option>
            )}
            {frequencies.map((f) => (
              <option key={f.label} value={`${f.unit}:${f.interval}`}>
                {f.label}
              </option>
            ))}
          </select>
          {values.frequency_unit === 'week' && values.interval === 4 && (
            <p className="text-xs text-muted-foreground">
              4 semaines = 28 jours. Les échéances peuvent tomber deux fois dans
              un même mois.
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="rec-start">Première échéance</Label>
            <Input
              id="rec-start"
              type="date"
              required
              value={values.start_date}
              onChange={(e) =>
                setValues({ ...values, start_date: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="rec-end">Fin (facultative)</Label>
            <Input
              id="rec-end"
              type="date"
              min={values.start_date}
              value={values.end_date ?? ''}
              onChange={(e) =>
                setValues({ ...values, end_date: e.target.value || null })
              }
            />
          </div>
        </div>
        {values.start_date < today && (
          <p className="text-xs text-muted-foreground">
            Les échéances passées seront ajoutées au prochain traitement, à 6 h.
          </p>
        )}
        {values.frequency_unit !== 'week' && startDay >= 29 && (
          <p className="text-xs text-muted-foreground">
            Les mois plus courts, l’échéance tombe le dernier jour du mois.
          </p>
        )}
        {rule && dirty && (
          <p className="text-xs text-muted-foreground">
            Les transactions déjà générées restent inchangées. Pour changer le
            calendrier, choisissez une nouvelle première échéance future.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="rec-note">Note (facultative)</Label>
          <Input
            id="rec-note"
            maxLength={5000}
            value={values.note ?? ''}
            onChange={(e) => setValues({ ...values, note: e.target.value })}
          />
        </div>
        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
      </fieldset>
      <div className="flex justify-end gap-2 border-t px-5 py-3">
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button
          disabled={
            mutation.isPending || !categories.length || !values.category_id
          }
          type="submit"
        >
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </form>
  )
}
