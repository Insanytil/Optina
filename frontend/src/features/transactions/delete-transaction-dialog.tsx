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
import { walletKeys } from '@/features/wallets/api'
import { deleteTransaction, transactionKeys } from './api'
import type { Transaction } from './api'

export function DeleteTransactionDialog({
  transaction,
  onClose,
  onDeleted,
}: {
  transaction: Transaction
  onClose: () => void
  onDeleted: () => void
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => deleteTransaction(transaction.id),
    onSuccess: async () => {
      onDeleted()
      await Promise.all([
        client.invalidateQueries({ queryKey: transactionKeys.all }),
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
          <DialogTitle>Supprimer ce mouvement ?</DialogTitle>
          <DialogDescription>
            « {transaction.label} » sera supprimé et son effet sur le solde sera
            annulé. Cette action est irréversible.
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
