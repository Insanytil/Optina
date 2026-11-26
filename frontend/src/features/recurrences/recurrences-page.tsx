import { useCallback, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChartNoAxesCombined, Plus, Repeat2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
} from './api'
import type { Recurrence } from './api'
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
  // Where to go once the user confirms dropping unsaved changes.
  const [pendingEditor, setPendingEditor] = useState<
    Recurrence | 'new' | null | false
  >(false)
  const dirty = useRef(false)
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])
  /** Opens, switches or closes the editor, asking first if edits would be lost. */
  function goTo(next: Recurrence | 'new' | null) {
    if (busy) return
    if (dirty.current) {
      setPendingEditor(next)
      return
    }
    setEditor(next)
  }
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
  const walletColor = wallets.data?.find((w) => w.id === walletId)?.color
  const walletSelect = (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-2.5 -translate-y-1/2 rounded-full"
        style={{ backgroundColor: walletColor ?? 'var(--primary)' }}
      />
      <select
        aria-label="Portefeuille"
        className="h-9 w-max max-w-56 rounded-md border bg-background pr-3 pl-7 text-sm"
        value={walletId}
        onChange={(e) => {
          setSelectedWallet(e.target.value)
          mutation.reset()
        }}
      >
        {wallets.data?.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
    </div>
  )
  return (
    <section className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Paramétrage
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Récurrences
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Vos rentrées et dépenses régulières, ajoutées automatiquement chaque
            jour à 6 h.
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
            onClick={() => goTo('new')}
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
              <>
                {walletSelect}
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
              </>
            ) : (
              <RecurrenceList
                key={walletId}
                rules={rules}
                categories={categories.data ?? []}
                busy={mutation.isPending}
                toolbarStart={walletSelect}
                onEdit={goTo}
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
      <Sheet
        open={editor !== null}
        onOpenChange={(open) => {
          if (!open) goTo(null)
        }}
      >
        <SheetContent
          className="w-full gap-0 p-0 sm:max-w-md"
          showCloseButton={!busy}
        >
          <SheetHeader className="gap-0.5 border-b px-5 py-4">
            <SheetDescription className="truncate text-xs">
              {editor && editor !== 'new'
                ? editor.type === 'income'
                  ? 'Rentrée'
                  : 'Dépense'
                : 'Nouvelle récurrence'}{' '}
              · {wallets.data?.find((w) => w.id === walletId)?.name}
            </SheetDescription>
            <SheetTitle className="truncate pr-8 text-lg">
              {editor === 'new' ? 'Nouvelle récurrence' : editor?.label}
            </SheetTitle>
          </SheetHeader>
          {editor && categories.data && (
            <RecurrenceForm
              key={editor === 'new' ? `new-${walletId}` : editor.id}
              rule={editor === 'new' ? undefined : editor}
              walletId={walletId}
              categories={categories.data}
              onBusy={setBusy}
              onDirtyChange={onDirtyChange}
              onCancel={() => goTo(null)}
              onClose={() => {
                setBusy(false)
                setEditor(null)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={pendingEditor !== false}
        onOpenChange={(open) => {
          if (!open) setPendingEditor(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les changements de cette récurrence n’ont pas été enregistrés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer la modification</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                dirty.current = false
                if (pendingEditor !== false) setEditor(pendingEditor)
                setPendingEditor(false)
              }}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arrêter « {deleting?.label} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les prochaines échéances seront annulées. Les transactions déjà
              générées seront conservées. Cette action est définitive.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {mutation.error && (
            <p role="alert" className="text-sm text-destructive">
              {mutation.error.message}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>
              Annuler
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() =>
                deleting && mutation.mutate({ rule: deleting, archive: true })
              }
            >
              {mutation.isPending ? 'Arrêt…' : 'Arrêter la récurrence'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
