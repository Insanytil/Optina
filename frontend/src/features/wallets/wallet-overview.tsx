import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { walletKeys } from './api'
import type { Wallet, WalletPage } from './api'
import { DeleteWalletDialog } from './delete-wallet-dialog'
import { WalletForm } from './wallet-form'
import { WalletGrid } from './wallet-grid'

/** Settings page: create, rename and delete wallets. */
export function WalletOverview() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<Wallet | null>(null)
  const [editor, setEditor] = useState<Wallet | 'new' | null>(null)

  return (
    <section className="mx-auto w-full min-w-0 max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Portefeuilles
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Créez et paramétrez vos portefeuilles, et consultez leurs soldes.
          </p>
        </div>
        <Button onClick={() => setEditor('new')}>
          <Plus aria-hidden="true" />
          Créer un portefeuille
        </Button>
      </header>
      <WalletGrid
        page={page}
        onPageChange={setPage}
        emptyAction={
          <Button
            variant="outline"
            className="mt-2"
            onClick={() => setEditor('new')}
          >
            <Plus aria-hidden="true" />
            Créer un portefeuille
          </Button>
        }
        renderActions={(wallet) => (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Modifier ${wallet.name}`}
              onClick={() => setEditor(wallet)}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label={`Supprimer ${wallet.name}`}
              onClick={() => setDeleting(wallet)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </>
        )}
      />
      {deleting && (
        <DeleteWalletDialog
          wallet={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null)
            const current = queryClient.getQueryData<WalletPage>(
              walletKeys.page(page),
            )
            if (current?.items.length === 1 && page > 1)
              setPage((value) => value - 1)
          }}
        />
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) setEditor(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor === 'new'
                ? 'Créer un portefeuille'
                : 'Modifier le portefeuille'}
            </DialogTitle>
            <DialogDescription>
              {editor === 'new'
                ? 'Donnez un nom à votre portefeuille et renseignez son solde initial.'
                : 'Modifiez le nom de votre portefeuille.'}
            </DialogDescription>
          </DialogHeader>
          {editor !== null && (
            <WalletForm
              key={editor === 'new' ? 'new' : editor.id}
              wallet={editor === 'new' ? undefined : editor}
              onSaved={() => {
                setEditor(null)
                if (editor === 'new') setPage(1)
              }}
              onCancel={() => setEditor(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
