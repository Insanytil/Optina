import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { categoryKeys, moveCategory } from './api'
import type { Category } from './api'
import { CategoryParentPicker } from './category-parent-picker'

export function MoveCategoryDialog({
  category,
  categories,
  onClose,
  onMoved,
}: {
  category: Category
  categories: Category[]
  onClose: () => void
  onMoved: (parentId: string | null) => void
}) {
  const [parentId, setParentId] = useState(category.parent_id)
  const [beforeId, setBeforeId] = useState('')
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: () =>
      moveCategory(category.id, {
        parent_id: parentId,
        before_id: beforeId || null,
      }),
    onSuccess: async () => {
      onMoved(parentId)
      await client.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
  const siblings = categories
    .filter((item) => item.parent_id === parentId && item.id !== category.id)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent
        className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
        showCloseButton={!mutation.isPending}
      >
        <DialogHeader>
          <DialogTitle>Déplacer « {category.name} »</DialogTitle>
          <DialogDescription>
            Choisissez un parent et une position. Les sous-catégories seront
            déplacées avec elle.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            mutation.mutate()
          }}
          aria-busy={mutation.isPending}
        >
          <fieldset disabled={mutation.isPending} className="min-w-0">
            <legend className="mb-2 text-sm font-medium">
              Catégorie parente
            </legend>
            <CategoryParentPicker
              value={parentId}
              onChange={(id) => {
                setParentId(id)
                setBeforeId('')
              }}
              excludeId={category.id}
              disabled={mutation.isPending}
            />
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="category-position">Position</Label>
            <select
              id="category-position"
              value={beforeId}
              disabled={mutation.isPending}
              onChange={(event) => setBeforeId(event.target.value)}
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
            >
              <option value="">À la fin de la liste</option>
              {siblings.map((item) => (
                <option key={item.id} value={item.id}>
                  Avant {item.name}
                </option>
              ))}
            </select>
          </div>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={onClose}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              )}
              {mutation.isPending ? 'Déplacement…' : 'Déplacer'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
