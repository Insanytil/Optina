import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChartNoAxesCombined, Plus, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { categoryKeys, loadCategoryTree } from '@/features/categories/api'
import {
  loadWalletOptions,
  walletOptionsKey,
  transactionKeys,
} from '@/features/transactions/api'
import { walletKeys } from '@/features/wallets/api'
import {
  recurrenceKeys,
  listRecurrences,
  changeRecurrenceStatus,
  archiveRecurrence,
  type Recurrence,
} from './api'
import { RecurrenceForm } from './recurrence-form'
import { RecurrenceList } from './recurrence-list'

export function RecurrencesPage({
  initialWalletId,
}: {
  initialWalletId?: string
}) {
  const client = useQueryClient()
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const categories = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const [selectedWallet, setSelectedWallet] = useState(initialWalletId ?? '')
  const walletId =
    wallets.data?.find((wallet) => wallet.id === selectedWallet)?.id ??
    wallets.data?.[0]?.id ??
    ''
  const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<Recurrence | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Recurrence | null>(null)
  const query = useQuery({
    queryKey: ['recurrences', 'list', walletId],
    queryFn: ({ signal }) => listRecurrences(walletId, signal),
    enabled: !!walletId,
    staleTime: 60_000,
  })
  const mutation = useMutation({
    mutationFn: async ({
      rule,
      archive,
    }: {
      rule: Recurrence
      archive?: boolean
    }) =>
      archive
        ? await archiveRecurrence(rule.id)
        : await changeRecurrenceStatus(rule),
    onSuccess: async () => {
      setDeleting(null)
      await Promise.all(
        [recurrenceKeys.all, walletKeys.all, transactionKeys.all].map(
          (queryKey) => client.invalidateQueries({ queryKey }),
        ),
      )
    },
  })
  const rules = query.data ?? []
  return (
    <section className="mx-auto max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Paramétrage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Récurrences
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Configurez vos rentrées et dépenses régulières : montant, catégorie
            et calendrier. Les transactions sont ajoutées automatiquement chaque
            jour à 6 h, heure de Bruxelles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={!walletId}
            nativeButton={false}
            render={
              <Link
                to="/forecasts"
                search={{ walletId: walletId || undefined }}
              />
            }
          >
            <ChartNoAxesCombined aria-hidden="true" />
            Voir les prévisions
          </Button>
          <Button
            className="min-h-11"
            disabled={!walletId || !categories.data?.length}
            onClick={() => setEditor('new')}
          >
            <Plus aria-hidden="true" />
            Nouvelle récurrence
          </Button>
        </div>
      </header>
      {wallets.isPending ? (
        <p role="status">Chargement des portefeuilles…</p>
      ) : wallets.isError ? (
        <p role="alert">{wallets.error.message}</p>
      ) : !wallets.data.length ? (
        <p className="rounded-xl border p-6">
          Créez d’abord un portefeuille depuis la page{' '}
          <Link to="/wallets" className="underline">
            Portefeuilles
          </Link>
          .
        </p>
      ) : (
        <>
          <div className="max-w-sm space-y-2">
            <Label htmlFor="rec-wallet">Portefeuille</Label>
            <select
              id="rec-wallet"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={walletId}
              onChange={(e) => {
                setSelectedWallet(e.target.value)
                mutation.reset()
              }}
            >
              {wallets.data.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {categories.isError && <p role="alert">{categories.error.message}</p>}
          {categories.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ajoutez une{' '}
              <Link to="/categories" className="underline">
                catégorie
              </Link>{' '}
              pour créer une récurrence.
            </p>
          )}
          <div className="space-y-3">
            <h2 className="font-semibold">Rentrées et dépenses régulières</h2>
            <p className="text-xs text-muted-foreground">
              Une suspension ignore les échéances pendant la pause. La reprise
              conserve le calendrier initial.
            </p>
            {mutation.error && (
              <p role="alert" className="text-sm text-destructive">
                {mutation.error.message}
              </p>
            )}
            {query.isPending ? (
              <p role="status">Chargement…</p>
            ) : query.isError ? (
              <div>
                <p role="alert">{query.error.message}</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Réessayer
                </Button>
              </div>
            ) : !rules.length ? (
              <div className="rounded-xl border border-dashed p-10 text-center">
                <Repeat2
                  className="mx-auto mb-3 size-7 text-muted-foreground"
                  aria-hidden="true"
                />
                <p>Aucune récurrence pour ce portefeuille.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Commencez par votre salaire, votre loyer ou un abonnement.
                </p>
              </div>
            ) : (
              <RecurrenceList
                key={walletId}
                rules={rules}
                categories={categories.data ?? []}
                busy={mutation.isPending}
                onEdit={setEditor}
                onToggle={(rule) => mutation.mutate({ rule })}
                onStop={(rule) => {
                  mutation.reset()
                  setDeleting(rule)
                }}
              />
            )}
          </div>
        </>
      )}
      <Dialog
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setEditor(null)
        }}
      >
        <DialogContent
          className="max-h-[90svh] overflow-y-auto sm:max-w-lg"
          showCloseButton={!busy}
        >
          <DialogHeader>
            <DialogTitle>
              {editor === 'new'
                ? 'Nouvelle récurrence'
                : 'Modifier la récurrence'}
            </DialogTitle>
            <DialogDescription>
              Définissez le montant et le calendrier des prochaines
              transactions.
            </DialogDescription>
          </DialogHeader>
          {editor && categories.data && (
            <RecurrenceForm
              key={editor === 'new' ? `new-${walletId}` : editor.id}
              rule={editor === 'new' ? undefined : editor}
              walletId={walletId}
              categories={categories.data}
              onBusy={setBusy}
              onClose={() => {
                setBusy(false)
                setEditor(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeleting(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Arrêter « {deleting?.label} » ?</DialogTitle>
            <DialogDescription>
              Les prochaines échéances seront annulées. Les transactions déjà
              générées seront conservées. Cette action est définitive.
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
              onClick={() => setDeleting(null)}
            >
              Annuler
            </Button>
            <Button
              disabled={mutation.isPending}
              onClick={() =>
                deleting && mutation.mutate({ rule: deleting, archive: true })
              }
            >
              Arrêter la récurrence
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
