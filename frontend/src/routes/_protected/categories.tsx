import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  LoaderCircle,
  Plus,
  Search,
} from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import {
  categoryKeys,
  loadCategoryTree,
  loadCategoryUsage,
  moveCategory,
} from '@/features/categories/api'
import type { Category, CategoryPlacement } from '@/features/categories/api'
import { CategorySheetContent } from '@/features/categories/category-detail'
import type { SheetMode } from '@/features/categories/category-detail'
import { CategoryTree } from '@/features/categories/category-tree'
import type { CategoryRowActions } from '@/features/categories/category-tree'
import {
  deletionBlocker,
  NO_USAGE,
  usageById,
} from '@/features/categories/category-usage'
import { DeleteCategoryDialog } from '@/features/categories/delete-category-dialog'
import { MoveCategoryDialog } from '@/features/categories/move-category-dialog'
import {
  ancestorIds,
  applyCategoryMove,
  indexCategories,
} from '@/features/categories/tree'
import { walletColors } from '@/features/calendar/calendar-model'
import {
  loadWalletOptions,
  walletOptionsKey,
} from '@/features/transactions/api'
import { walletKeys } from '@/features/wallets/api'
import { sessionOptions } from '@/features/auth/session'
import type { User } from '@/features/auth/session'

export const Route = createFileRoute('/_protected/categories')({
  component: CategoriesPage,
})

/** How long a freshly created row stays highlighted. */
const FLASH_MS = 4000

function CategoriesPage() {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [sheet, setSheet] = useState<SheetMode | null>(null)
  // Where to go once the user confirms dropping unsaved changes.
  const [pendingSheet, setPendingSheet] = useState<SheetMode | null | false>(
    false,
  )
  const dirty = useRef(false)
  const [flashId, setFlashId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [moving, setMoving] = useState<Category | null>(null)
  const [notice, setNotice] = useState('')

  const tree = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  const usage = useQuery({
    queryKey: categoryKeys.usage,
    queryFn: ({ signal }) => loadCategoryUsage(signal),
  })
  const wallets = useQuery({
    queryKey: walletOptionsKey,
    queryFn: ({ signal }) => loadWalletOptions(signal),
  })
  const move = useMutation({
    mutationFn: ({
      id,
      placement,
    }: {
      id: string
      placement: CategoryPlacement
    }) => moveCategory(id, placement),
    onMutate: async ({ id, placement }) => {
      await client.cancelQueries({ queryKey: categoryKeys.tree })
      const previous = client.getQueryData<Category[]>(categoryKeys.tree)
      const userId = client.getQueryData<User | null>(
        sessionOptions.queryKey,
      )?.id
      if (previous)
        client.setQueryData(
          categoryKeys.tree,
          applyCategoryMove(previous, id, placement),
        )
      setNotice('')
      return { previous, userId }
    },
    onSuccess: (category) => {
      reveal(category.parent_id)
      setNotice(`« ${category.name} » a été déplacée.`)
    },
    onError: (_error, _variables, context) => {
      if (
        context?.previous &&
        context.userId &&
        client.getQueryData<User | null>(sessionOptions.queryKey)?.id ===
          context.userId
      )
        client.setQueryData(categoryKeys.tree, context.previous)
    },
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: categoryKeys.all }),
        client.invalidateQueries({ queryKey: walletKeys.all }),
      ])
    },
  })

  const categories = useMemo(() => tree.data ?? [], [tree.data])
  const index = useMemo(() => indexCategories(categories), [categories])
  const usages = useMemo(() => usageById(usage.data ?? []), [usage.data])
  const colors = useMemo(() => walletColors(wallets.data ?? []), [wallets.data])
  const walletNames = useMemo(
    () => new Map((wallets.data ?? []).map((w) => [w.id, w.name])),
    [wallets.data],
  )

  useEffect(() => {
    if (!flashId) return
    const timer = window.setTimeout(() => setFlashId(null), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [flashId])

  function reveal(parentId: string | null) {
    if (!parentId) return
    const ids = [parentId, ...ancestorIds(index, parentId)]
    setExpanded((current) => new Set([...current, ...ids]))
  }
  /** Opens, switches or closes the sheet, asking first if edits would be lost. */
  function goTo(next: SheetMode | null) {
    if (dirty.current) {
      setPendingSheet(next)
      return
    }
    dirty.current = false
    setNotice('')
    setSheet(next)
  }
  const onDirtyChange = useCallback((value: boolean) => {
    dirty.current = value
  }, [])

  const actions: CategoryRowActions = {
    onEdit: (category) => goTo({ kind: 'edit', id: category.id }),
    onCreateChild: (category) => {
      reveal(category.id)
      goTo({ kind: 'new', parentId: category.id })
    },
    onMove: (category) => {
      move.reset()
      setMoving(category)
    },
    onDelete: (category) => setDeleting(category),
  }
  const highlightedId = sheet?.kind === 'edit' ? sheet.id : flashId

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catégories</h1>
          <p className="text-sm text-muted-foreground">
            Organisez vos catégories et choisissez où elles sont proposées.
          </p>
        </div>
        <Button
          disabled={move.isPending}
          onClick={() => goTo({ kind: 'new', parentId: null })}
        >
          <Plus aria-hidden="true" />
          Nouvelle catégorie
        </Button>
      </header>

      {tree.isPending ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Chargement des catégories…
        </p>
      ) : tree.isError ? (
        <div className="space-y-3 rounded-xl border p-6">
          <p role="alert" className="text-sm text-destructive">
            {tree.error.message}
          </p>
          <Button
            variant="outline"
            disabled={tree.isFetching}
            onClick={() => void tree.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : categories.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderTree />
            </EmptyMedia>
            <EmptyTitle>Votre première catégorie</EmptyTitle>
            <EmptyDescription>
              Créez une catégorie, puis ajoutez autant de sous-catégories que
              nécessaire.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="outline"
            onClick={() => goTo({ kind: 'new', parentId: null })}
          >
            <Plus aria-hidden="true" />
            Créer une catégorie
          </Button>
        </Empty>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une catégorie"
                aria-label="Rechercher une catégorie"
                className="pl-8"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={move.isPending || !!query}
              onClick={() =>
                setExpanded(
                  new Set(
                    categories.flatMap((item) =>
                      item.parent_id ? [item.parent_id] : [],
                    ),
                  ),
                )
              }
            >
              <ChevronsUpDown aria-hidden="true" />
              Tout déplier
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={move.isPending || !!query}
              onClick={() => setExpanded(new Set())}
            >
              <ChevronsDownUp aria-hidden="true" />
              Tout replier
            </Button>
          </div>
          <CategoryTree
            categories={categories}
            expanded={expanded}
            onExpandedChange={setExpanded}
            busy={move.isPending}
            query={query}
            highlightedId={highlightedId}
            usage={usages}
            colors={colors}
            walletNames={walletNames}
            actions={actions}
            onDrop={(id, placement) => move.mutate({ id, placement })}
          />
          {move.isPending && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <LoaderCircle
                className="size-4 animate-spin"
                aria-hidden="true"
              />
              Enregistrement du déplacement…
            </p>
          )}
          {move.error && (
            <p role="alert" className="text-sm text-destructive">
              {move.error.message}
            </p>
          )}
          <p
            role="status"
            className={notice ? 'text-sm text-muted-foreground' : 'sr-only'}
          >
            {notice}
          </p>
        </div>
      )}

      <Sheet
        open={sheet !== null}
        onOpenChange={(open) => {
          if (!open) goTo(null)
        }}
      >
        <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
          {sheet && (
            <CategorySheetContent
              mode={sheet}
              index={index}
              usage={usages}
              colors={colors}
              actions={actions}
              onDirtyChange={onDirtyChange}
              onCancel={() => goTo(null)}
              onSaved={(category) => {
                dirty.current = false
                reveal(category.parent_id)
                setFlashId(category.id)
                setSheet(null)
                setNotice(
                  `« ${category.name} » a été ${sheet.kind === 'new' ? 'créée' : 'enregistrée'}.`,
                )
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingSheet !== false}
        onOpenChange={(open) => {
          if (!open) setPendingSheet(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les changements de cette catégorie n’ont pas été enregistrés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer la modification</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                dirty.current = false
                setSheet(pendingSheet === false ? sheet : pendingSheet)
                setPendingSheet(false)
              }}
            >
              Abandonner
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          blocker={deletionBlocker(
            usages.get(deleting.id) ?? NO_USAGE,
            index.children.get(deleting.id)?.length ?? 0,
          )}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setNotice(`« ${deleting.name} » a été supprimée.`)
            if (sheet?.kind === 'edit' && sheet.id === deleting.id) {
              dirty.current = false
              setSheet(null)
            }
            setDeleting(null)
          }}
        />
      )}
      {moving && (
        <MoveCategoryDialog
          category={moving}
          categories={categories}
          onClose={() => setMoving(null)}
          onMoved={(parentId) => {
            reveal(parentId)
            move.reset()
            setNotice(`« ${moving.name} » a été déplacée.`)
            setMoving(null)
          }}
        />
      )}
    </section>
  )
}
