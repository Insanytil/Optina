import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Wallet } from '@/features/wallets/api'
import { walletKeys } from '@/features/wallets/api'
import type { Category } from '@/features/categories/api'
import { saveTransaction, transactionKeys } from './api'
import type { Transaction } from './api'
import { localToday, transactionFormSchema } from './form-values'
import { categoryAvailable, categoryOptions } from './category-options'

const selectClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm disabled:opacity-50'

export function TransactionForm({
  transaction,
  wallets,
  categories,
  initialWalletId,
  initialCategoryId,
  onSaved,
  onCancel,
  onBusy,
  lockedWallet = false,
}: {
  transaction?: Transaction
  lockedWallet?: boolean
  wallets: Wallet[]
  categories: Category[]
  initialWalletId: string
  initialCategoryId: string
  onSaved: () => void
  onCancel: () => void
  onBusy: (value: boolean) => void
}) {
  const opening = transaction?.kind === 'opening_balance'
  const client = useQueryClient()
  const {
    register,
    control,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(transactionFormSchema(opening)),
    defaultValues: {
      wallet_id: transaction?.wallet_id ?? initialWalletId,
      category_id:
        transaction?.category_id ??
        (categoryAvailable(categories, initialCategoryId, initialWalletId)
          ? initialCategoryId
          : ''),
      type: transaction?.type ?? 'expense',
      amount: transaction?.amount ?? '',
      date: transaction?.date ?? localToday(),
      label: transaction?.label ?? '',
      note: transaction?.note ?? '',
    },
  })
  const selectedWallet = useWatch({ control, name: 'wallet_id' })
  const choices = categoryOptions(categories, selectedWallet)
  if (
    transaction?.category_id &&
    transaction.wallet_id === selectedWallet &&
    !choices.some((c) => c.id === transaction.category_id)
  ) {
    choices.push({
      id: transaction.category_id,
      label: `${categories.find((c) => c.id === transaction.category_id)?.name ?? 'Catégorie'} (historique)`,
    })
  }
  const mutation = useMutation({
    mutationFn: (values: {
      wallet_id: string
      category_id: string
      type: 'income' | 'expense'
      amount: string
      date: string
      label: string
      note: string
    }) =>
      saveTransaction(
        {
          ...values,
          category_id: opening ? null : values.category_id,
          amount: values.amount.replace(',', '.'),
          note: values.note.trim() || null,
        },
        transaction?.id,
      ),
    onMutate: () => onBusy(true),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: transactionKeys.all }),
        client.invalidateQueries({ queryKey: walletKeys.all }),
      ])
      onSaved()
    },
    onSettled: () => onBusy(false),
  })
  function error(name: keyof typeof errors) {
    return errors[name] ? (
      <p id={`transaction-${name}-error`} className="text-sm text-destructive">
        {errors[name]?.message}
      </p>
    ) : null
  }
  function described(name: keyof typeof errors) {
    return errors[name] ? `transaction-${name}-error` : undefined
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      aria-busy={mutation.isPending}
    >
      {opening && (
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          Ce mouvement représente le solde initial du portefeuille. Il est exclu
          des statistiques de dépenses et de rentrées.
        </p>
      )}
      <div className="space-y-2">
        <Label htmlFor="transaction-label">Libellé</Label>
        <Input
          id="transaction-label"
          autoFocus
          placeholder="Ex. Courses, salaire…"
          className="h-10"
          disabled={mutation.isPending}
          aria-invalid={!!errors.label}
          aria-describedby={described('label')}
          {...register('label')}
        />
        {error('label')}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="transaction-type">
            {opening ? 'Sens du solde initial' : 'Type'}
          </Label>
          <select
            id="transaction-type"
            className={selectClass}
            disabled={mutation.isPending}
            {...register('type')}
          >
            <option value="expense">
              {opening ? 'Solde négatif' : 'Dépense'}
            </option>
            <option value="income">
              {opening ? 'Solde positif' : 'Rentrée'}
            </option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="transaction-amount">Montant</Label>
          <Input
            id="transaction-amount"
            inputMode="decimal"
            className="h-10"
            placeholder="0,00"
            disabled={mutation.isPending}
            aria-invalid={!!errors.amount}
            aria-describedby={described('amount')}
            {...register('amount')}
          />
          {error('amount')}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="transaction-wallet">Portefeuille</Label>
        {opening || lockedWallet ? (
          <>
            <input
              id="transaction-wallet"
              type="hidden"
              {...register('wallet_id', {
                onChange: () => setValue('category_id', ''),
              })}
            />
            <p className="rounded-lg border p-3 text-sm">
              {wallets.find(
                (wallet) =>
                  wallet.id === (transaction?.wallet_id ?? initialWalletId),
              )?.name ?? 'Portefeuille indisponible'}
            </p>
          </>
        ) : (
          <select
            id="transaction-wallet"
            className={selectClass}
            disabled={mutation.isPending}
            aria-invalid={!!errors.wallet_id}
            aria-describedby={described('wallet_id')}
            {...register('wallet_id', {
              onChange: () => setValue('category_id', ''),
            })}
          >
            <option value="">Choisir un portefeuille</option>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name}
              </option>
            ))}
          </select>
        )}
        {error('wallet_id')}
      </div>
      {!opening && (
        <div className="space-y-2">
          <Label htmlFor="transaction-category">Catégorie</Label>
          <select
            id="transaction-category"
            className={selectClass}
            disabled={mutation.isPending}
            aria-invalid={!!errors.category_id}
            aria-describedby={described('category_id')}
            {...register('category_id')}
          >
            <option value="">Choisir une catégorie</option>
            {choices.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
          {error('category_id')}
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="transaction-date">Date du mouvement</Label>
        <Input
          id="transaction-date"
          type="date"
          max={localToday()}
          className="h-10"
          disabled={mutation.isPending}
          aria-invalid={!!errors.date}
          aria-describedby={described('date')}
          {...register('date')}
        />
        {error('date')}
      </div>
      <div className="space-y-2">
        <Label htmlFor="transaction-note">
          Note{' '}
          <span className="font-normal text-muted-foreground">
            (facultative)
          </span>
        </Label>
        <Textarea
          id="transaction-note"
          rows={3}
          maxLength={5000}
          disabled={mutation.isPending}
          aria-invalid={!!errors.note}
          aria-describedby={described('note')}
          {...register('note')}
        />
        {error('note')}
      </div>
      {mutation.error && (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          )}
          {mutation.isPending
            ? 'Enregistrement…'
            : transaction
              ? 'Enregistrer'
              : 'Ajouter la transaction'}
        </Button>
      </div>
    </form>
  )
}
