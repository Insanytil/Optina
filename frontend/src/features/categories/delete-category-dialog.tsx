import { walletKeys } from '@/features/wallets/api'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { categoryKeys, deleteCategory } from './api'
import type { Category } from './api'

export function DeleteCategoryDialog({
  category,
  onClose,
  onDeleted,
}: {
  category: Category
  onClose: () => void
  onDeleted: () => void
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => deleteCategory(category.id),
    onSuccess: async () => {
      onDeleted()
      await Promise.all([
        client.invalidateQueries({ queryKey: categoryKeys.all }),
        client.invalidateQueries({ queryKey: walletKeys.all }),
      ])
    },
  })
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose()
      }}
    >
      <DialogContent showCloseButton={!mutation.isPending}>
        <DialogHeader>
          <DialogTitle>Supprimer la catégorie ?</DialogTitle>
          <DialogDescription>
            La catégorie « {category.name} » sera définitivement supprimée. Elle
            doit être vide de sous-catégories pour pouvoir être supprimée.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {mutation.isPending ? 'Suppression…' : 'Supprimer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
