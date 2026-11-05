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
import { deleteWallet, walletKeys } from './api'
import type { Wallet } from './api'

export function DeleteWalletDialog({
  wallet,
  onClose,
  onDeleted,
}: {
  wallet: Wallet
  onClose: () => void
  onDeleted: () => void
}) {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: () => deleteWallet(wallet.id),
    onSuccess: async () => {
      onDeleted()
      await client.invalidateQueries({ queryKey: walletKeys.all })
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
          <DialogTitle>Supprimer le portefeuille ?</DialogTitle>
          <DialogDescription>
            Le portefeuille « {wallet.name} » sera définitivement supprimé.
            Cette action est irréversible. Un portefeuille contenant des
            mouvements doit être conservé.
          </DialogDescription>
        </DialogHeader>
        {mutation.error && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2" aria-busy={mutation.isPending}>
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
