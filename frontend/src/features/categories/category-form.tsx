import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { WalletSwatch } from '@/features/calendar/wallet-filter'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { categoryAvailable } from '@/features/transactions/category-options'
import { walletKeys } from '@/features/wallets/api'
import { cn } from 'cn'
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

const sameIds = (a: string[] | null, b: string[] | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every((id) => b.includes(id)))

/**
 * Compact category form laid out for the side sheet: a scrolling body and a
 * footer pinned at the bottom with `actions` on the left.
 */
export function CategoryForm({
  category,
  initialParentId,
  colors,
  children,
  actions,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  category?: Category
  initialParentId: string | null
  colors: Map<string, string>
  /** Extra read-only content shown under the fields (e.g. usage). */
  children?: ReactNode
  /** Footer content on the left (e.g. a "Plus" menu). */
  actions?: ReactNode
  onSaved: (category: Category) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const startParent = category?.parent_id ?? initialParentId
  const startWallets = category?.wallet_ids ?? null
  const [parentId, setParentId] = useState(startParent)
  const [walletIds, setWalletIds] = useState<string[] | null>(startWallets)
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
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: category?.name ?? '' },
  })
  const dirty =
    isDirty || parentId !== startParent || !sameIds(walletIds, startWallets)
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const mutation = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      saveCategory(
        { name: values.name, parent_id: parentId, wallet_ids: walletIds },
        category?.id,
      ),
    onSuccess: async (saved) => {
      onDirtyChange(false)
      await Promise.all([
        client.invalidateQueries({ queryKey: categoryKeys.all }),
        client.invalidateQueries({ queryKey: walletKeys.all }),
      ])
      onSaved(saved)
    },
  })
  const parentName = parentId
    ? tree.data?.find((item) => item.id === parentId)?.name
    : undefined
  const pending = mutation.isPending
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      aria-busy={pending}
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="category-name">Nom</Label>
          <Input
            id="category-name"
            autoFocus={!category}
            placeholder="Ex. Transport, Santé…"
            maxLength={255}
            disabled={pending}
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

        <fieldset className="min-w-0 space-y-1.5" disabled={pending}>
          <legend className="mb-1.5 text-sm font-medium">
            Catégorie parente
          </legend>
          <CategoryParentPicker
            value={parentId}
            onChange={setParentId}
            excludeId={category?.id}
            disabled={pending}
          />
        </fieldset>

        <fieldset
          className="space-y-2.5"
          disabled={pending || wallets.isPending || tree.isPending}
        >
          <legend className="mb-1.5 text-sm font-medium">Portefeuilles</legend>
          <Label className="flex items-center justify-between gap-3 font-normal">
            <span>
              {parentId
                ? `Comme le parent${parentName ? ` (${parentName})` : ''}`
                : 'Tous les portefeuilles, actuels et futurs'}
            </span>
            <Switch
              checked={walletIds === null}
              onCheckedChange={(checked) => setWalletIds(checked ? null : [])}
            />
          </Label>
          {walletIds !== null && (
            <div className="flex flex-wrap gap-1.5">
              {wallets.data?.map((wallet) => {
                const allowed =
                  !parentId ||
                  categoryAvailable(tree.data ?? [], parentId, wallet.id)
                const on = walletIds.includes(wallet.id)
                return (
                  <button
                    key={wallet.id}
                    type="button"
                    aria-pressed={on}
                    disabled={!allowed && !on}
                    title={allowed ? undefined : 'Exclu par le parent'}
                    onClick={() =>
                      setWalletIds(
                        on
                          ? walletIds.filter((id) => id !== wallet.id)
                          : [...walletIds, wallet.id],
                      )
                    }
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      on
                        ? 'border-primary bg-primary/10'
                        : 'border-dashed text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <WalletSwatch
                      color={colors.get(wallet.id) ?? 'currentColor'}
                    />
                    {wallet.name}
                  </button>
                )
              })}
              {wallets.data?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucun portefeuille disponible.
                </p>
              )}
            </div>
          )}
          {walletIds !== null && walletIds.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Aucun portefeuille choisi : la catégorie ne sera proposée nulle
              part.
            </p>
          )}
          {(wallets.isError || tree.isError) && (
            <p role="alert" className="text-sm text-destructive">
              {wallets.error?.message ?? tree.error?.message}
            </p>
          )}
        </fieldset>

        {children}

        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
        <div>{actions}</div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onCancel}
          >
            Annuler
          </Button>
          <Button
            type="submit"
            disabled={
              pending ||
              (category !== undefined && !dirty) ||
              wallets.isPending ||
              wallets.isError ||
              tree.isPending ||
              tree.isError
            }
          >
            {pending && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {pending ? 'Enregistrement…' : category ? 'Enregistrer' : 'Créer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
