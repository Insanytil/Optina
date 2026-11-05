import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveWallet, walletKeys } from './api'
import type { Wallet } from './api'
import { localToday } from '@/features/transactions/form-values'
import { transactionKeys } from '@/features/transactions/api'

const schema = z.object({
  opening_date: z.iso
    .date()
    .refine(
      (date) => date <= localToday(),
      'La date ne peut pas être dans le futur.',
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Saisissez un nom.')
    .max(255, '255 caractères maximum.'),
  balance: z
    .string()
    .trim()
    .regex(
      /^-?\d{1,17}([.,]\d{1,2})?$/,
      'Saisissez un montant avec au maximum 2 décimales.',
    ),
})

export function WalletForm({
  wallet,
  onSaved,
  onCancel,
}: {
  wallet?: Wallet
  onSaved: () => void
  onCancel: () => void
}) {
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      opening_date: localToday(),
      name: wallet?.name ?? '',
      balance: wallet?.balance ?? '0.00',
    },
  })
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      saveWallet(
        wallet
          ? { name: values.name }
          : {
              name: values.name,
              balance: values.balance.replace(',', '.'),
              opening_date: values.opening_date,
            },
        wallet?.id,
      ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: walletKeys.all }),
        client.invalidateQueries({ queryKey: transactionKeys.all }),
      ])
      onSaved()
    },
  })
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      aria-busy={mutation.isPending}
    >
      <div className="space-y-2">
        <Label htmlFor="wallet-name">Nom du portefeuille</Label>
        <Input
          id="wallet-name"
          autoFocus
          placeholder="Ex. Compte courant"
          className="h-10"
          maxLength={255}
          disabled={mutation.isPending}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'wallet-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="wallet-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      {!wallet && (
        <div className="space-y-2">
          <Label htmlFor="wallet-balance">Solde initial</Label>
          <Input
            id="wallet-balance"
            inputMode="decimal"
            className="h-10"
            disabled={mutation.isPending}
            aria-invalid={!!errors.balance}
            aria-describedby={
              errors.balance ? 'wallet-balance-error' : undefined
            }
            {...register('balance')}
          />
          {errors.balance && (
            <p id="wallet-balance-error" className="text-sm text-destructive">
              {errors.balance.message}
            </p>
          )}
        </div>
      )}
      {!wallet && (
        <div className="space-y-2">
          <Label htmlFor="wallet-opening-date">Date du solde initial</Label>
          <Input
            id="wallet-opening-date"
            type="date"
            max={localToday()}
            className="h-10"
            disabled={mutation.isPending}
            aria-invalid={!!errors.opening_date}
            {...register('opening_date')}
          />
          {errors.opening_date && (
            <p className="text-sm text-destructive">
              {errors.opening_date.message}
            </p>
          )}
        </div>
      )}
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
            : wallet
              ? 'Enregistrer'
              : 'Créer le portefeuille'}
        </Button>
      </div>
    </form>
  )
}
