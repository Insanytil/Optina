import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { categoryKeys, saveCategory } from './api'
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
      saveCategory({ name: values.name, parent_id: parentId }, category?.id),
    onMutate: () => onBusy(true),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: categoryKeys.all })
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
            : category
              ? 'Enregistrer'
              : 'Créer la catégorie'}
        </Button>
      </div>
    </form>
  )
}
