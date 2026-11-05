import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Repeat2 } from 'lucide-react'
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
import { walletKeys, formatBalance } from '@/features/wallets/api'
import {
  recurrenceKeys,
  listRecurrences,
  frequencyLabel,
  changeRecurrenceStatus,
  archiveRecurrence,
  type Recurrence,
} from './api'
import { RecurrenceForm } from './recurrence-form'
import { ForecastPanel } from './forecast-panel'

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
  const walletId = selectedWallet || wallets.data?.[0]?.id || ''
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
          <h1 className="text-2xl font-semibold tracking-tight">Récurrences</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Anticipez vos rentrées et vos charges régulières. Les transactions
            sont ajoutées automatiquement chaque jour à 6 h, heure de Bruxelles.
          </p>
        </div>
        <Button
          disabled={!walletId || !categories.data?.length}
          onClick={() => setEditor('new')}
        >
          <Plus aria-hidden="true" />
          Nouvelle récurrence
        </Button>
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
          <ForecastPanel key={walletId} walletId={walletId} />
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
              <ul className="grid gap-3 lg:grid-cols-2">
                {rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-xl border bg-card p-4"
                  >
                    <div className="min-w-0">
                      <h3 className="break-words font-medium">{rule.label}</h3>
                      <p
                        className={`mt-1 font-semibold tabular-nums ${rule.type === 'income' ? 'text-emerald-500' : ''}`}
                      >
                        {rule.type === 'income' ? '+' : '−'}
                        {formatBalance(rule.amount)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {frequencyLabel(rule)} ·{' '}
                        {categories.data?.find((c) => c.id === rule.category_id)
                          ?.name ?? 'Catégorie'}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {!rule.is_active
                          ? 'En pause'
                          : rule.next_date
                            ? `Prochaine échéance : ${new Date(`${rule.next_date}T12:00:00`).toLocaleDateString('fr-BE')}`
                            : 'Terminée'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => setEditor(rule)}
                      >
                        Modifier
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={mutation.isPending || !rule.next_date}
                        onClick={() => mutation.mutate({ rule })}
                      >
                        {rule.is_active ? 'Suspendre' : 'Reprendre'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={mutation.isPending}
                        onClick={() => {
                          mutation.reset()
                          setDeleting(rule)
                        }}
                      >
                        Arrêter
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
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
