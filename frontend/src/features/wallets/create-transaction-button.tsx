import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import { TransactionForm } from '@/features/transactions/transaction-form'
import type { Wallet } from './api'

export function CreateTransactionButton({ wallet }: { wallet: Wallet }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
    enabled: open,
  })
  return (
    <>
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-500"
        onClick={() => setOpen(true)}
      >
        <Plus aria-hidden="true" />
        Ajouter une transaction
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value)
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>Ajouter une transaction</DialogTitle>
            <DialogDescription>Portefeuille : {wallet.name}</DialogDescription>
          </DialogHeader>
          {categories.isPending ? (
            <p role="status">Chargement…</p>
          ) : categories.isError ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-destructive">
                {categories.error.message}
              </p>
              <Button
                variant="outline"
                onClick={() => void categories.refetch()}
              >
                Réessayer
              </Button>
            </div>
          ) : categories.data.length === 0 ? (
            <p className="text-sm">
              Pour ajouter un mouvement,{' '}
              <Link to="/categories" className="underline">
                créez d’abord une catégorie
              </Link>
              .
            </p>
          ) : (
            <TransactionForm
              wallets={[wallet]}
              categories={categories.data}
              lockedWallet
              initialWalletId={wallet.id}
              initialCategoryId=""
              onBusy={setBusy}
              onCancel={() => setOpen(false)}
              onSaved={() => {
                setBusy(false)
                setOpen(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
