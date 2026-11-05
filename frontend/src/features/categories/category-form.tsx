import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { categoryAvailable } from '@/features/transactions/category-options'
import { walletKeys } from '@/features/wallets/api'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoryKeys, loadCategoryTree, saveCategory } from './api'
import type { Category } from './api'
import { CategoryParentPicker } from './category-parent-picker'

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Saisissez un nom.')
    .max(255, '255 caractères maximum.'),
})

export function CategoryForm({
  category,
  initialParentId,
  onSaved,
  onCancel,
  onBusy,
}: {
  category?: Category
  initialParentId: string | null
  onSaved: (parentId: string | null) => void
  onCancel: () => void
  onBusy: (busy: boolean) => void
}) {
  const [parentId, setParentId] = useState(
    category?.parent_id ?? initialParentId,
  )
  const [walletIds, setWalletIds] = useState<string[] | null>(
    category?.wallet_ids ?? null,
  )
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const tree = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const client = useQueryClient()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: category?.name ?? '' },
  })
  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      saveCategory(
        { name: values.name, parent_id: parentId, wallet_ids: walletIds },
        category?.id,
      ),
    onMutate: () => onBusy(true),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: categoryKeys.all }),
        client.invalidateQueries({ queryKey: walletKeys.all }),
      ])
      onSaved(parentId)
    },
    onSettled: () => onBusy(false),
  })
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      aria-busy={mutation.isPending}
    >
      <div className="space-y-2">
        <Label htmlFor="category-name">Nom de la catégorie</Label>
        <Input
          id="category-name"
          autoFocus
          className="h-10"
          placeholder="Ex. Transport, Santé…"
          maxLength={255}
          disabled={mutation.isPending}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...register('name')}
        />
        {errors.name && (
          <p id="category-name-error" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <fieldset className="min-w-0 space-y-2" disabled={mutation.isPending}>
        <legend className="mb-2 text-sm font-medium">Catégorie parente</legend>
        <CategoryParentPicker
          value={parentId}
          onChange={setParentId}
          excludeId={category?.id}
          disabled={mutation.isPending}
        />
      </fieldset>
      <fieldset
        className="space-y-3"
        disabled={mutation.isPending || wallets.isPending || tree.isPending}
      >
        <legend className="mb-2 text-sm font-medium">
          Disponibilité dans les portefeuilles
        </legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="availability"
            checked={walletIds === null}
            onChange={() => setWalletIds(null)}
          />
          {parentId
            ? 'Hériter des portefeuilles du parent'
            : 'Tous les portefeuilles, actuels et futurs'}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="availability"
            checked={walletIds !== null}
            onChange={() => setWalletIds([])}
          />
          Choisir certains portefeuilles
        </label>
        {wallets.isError && (
          <p role="alert" className="text-sm text-destructive">
            {wallets.error.message}
          </p>
        )}
        {tree.isError && (
          <p role="alert" className="text-sm text-destructive">
            {tree.error.message}
          </p>
        )}
        {walletIds !== null && (
          <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-3">
            {wallets.data?.map((wallet) => {
              const allowed =
                !parentId ||
                categoryAvailable(tree.data ?? [], parentId, wallet.id)
              return (
                <label
                  key={wallet.id}
                  className={`flex items-center gap-2 text-sm ${!allowed ? 'text-muted-foreground' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={walletIds.includes(wallet.id)}
                    disabled={!allowed && !walletIds.includes(wallet.id)}
                    onChange={(event) =>
                      setWalletIds(
                        event.target.checked
                          ? [...walletIds, wallet.id]
                          : walletIds.filter((id) => id !== wallet.id),
                      )
                    }
                  />
                  {wallet.name}
                  {!allowed && ' (exclu par le parent)'}
                </label>
              )
            })}
            {wallets.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucun portefeuille disponible.
              </p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Les restrictions des parents s’appliquent toujours aux
          sous-catégories. Les transactions existantes restent dans vos
          analyses.
        </p>
      </fieldset>
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
        <Button
          type="submit"
          disabled={
            mutation.isPending ||
            wallets.isPending ||
            wallets.isError ||
            tree.isPending ||
            tree.isError
          }
        >
          {mutation.isPending && (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          )}
          {mutation.isPending
            ? 'Enregistrement…'
            : category
              ? 'Enregistrer'
              : 'Créer la catégorie'}
        </Button>
      </div>
    </form>
  )
}
