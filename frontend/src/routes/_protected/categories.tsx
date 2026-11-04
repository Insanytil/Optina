import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FolderTree,
  LoaderCircle,
  Plus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  categoryKeys,
  loadCategoryTree,
  moveCategory,
} from '@/features/categories/api'
import type { Category, CategoryPlacement } from '@/features/categories/api'
import { CategoryForm } from '@/features/categories/category-form'
import { CategoryTree } from '@/features/categories/category-tree'
import { DeleteCategoryDialog } from '@/features/categories/delete-category-dialog'
import { MoveCategoryDialog } from '@/features/categories/move-category-dialog'
import { applyCategoryMove } from '@/features/categories/tree'
import { sessionOptions } from '@/features/auth/session'
import type { User } from '@/features/auth/session'

export const Route = createFileRoute('/_protected/categories')({
  component: CategoriesPage,
})

type Editor = { category?: Category; parentId: string | null }

function CategoriesPage() {
  const client = useQueryClient()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<Category | null>(null)
  const [moving, setMoving] = useState<Category | null>(null)
  const [notice, setNotice] = useState('')
  const query = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
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
      await client.invalidateQueries({ queryKey: categoryKeys.all })
    },
  })
  function reveal(parentId: string | null) {
    if (parentId) setExpanded((current) => new Set([...current, parentId]))
  }
  const categories = query.data ?? []
  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Catégories</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organisez vos catégories et sous-catégories comme vous le souhaitez.
          </p>
        </div>
        <Button
          disabled={move.isPending}
          onClick={() => setEditor({ parentId: null })}
        >
          <Plus aria-hidden="true" />
          Créer une catégorie
        </Button>
      </header>
      {query.isPending ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          Chargement des catégories…
        </p>
      ) : query.isError ? (
        <div className="space-y-3 rounded-xl border p-6">
          <p role="alert" className="text-sm text-destructive">
            {query.error.message}
          </p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Réessayer
          </Button>
        </div>
      ) : categories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
          <FolderTree
            className="mb-2 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-semibold">Votre première catégorie</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Créez une catégorie, puis ajoutez autant de sous-catégories que
            nécessaire.
          </p>
          <Button
            variant="outline"
            onClick={() => setEditor({ parentId: null })}
          >
            <Plus aria-hidden="true" />
            Créer une catégorie
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {categories.length} catégorie{categories.length > 1 ? 's' : ''}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={move.isPending}
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
                disabled={move.isPending}
                onClick={() => setExpanded(new Set())}
              >
                <ChevronsDownUp aria-hidden="true" />
                Tout replier
              </Button>
            </div>
          </div>
          <CategoryTree
            categories={categories}
            expanded={expanded}
            onExpandedChange={setExpanded}
            busy={move.isPending}
            onCreate={(parentId) => setEditor({ parentId })}
            onEdit={(category) =>
              setEditor({ category, parentId: category.parent_id })
            }
            onDelete={setDeleting}
            onMove={(category) => {
              move.reset()
              setMoving(category)
            }}
            onDrop={(id, placement) => move.mutate({ id, placement })}
          />
        </>
      )}
      {move.isPending && (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
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
              {editor?.category
                ? 'Modifier la catégorie'
                : 'Créer une catégorie'}
            </DialogTitle>
            <DialogDescription>
              Choisissez un nom et, si nécessaire, une catégorie parente.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <CategoryForm
              key={editor.category?.id ?? `new-${editor.parentId}`}
              category={editor.category}
              initialParentId={editor.parentId}
              onBusy={setBusy}
              onCancel={() => setEditor(null)}
              onSaved={(parentId) => {
                reveal(parentId)
                setEditor(null)
                setBusy(false)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      {deleting && (
        <DeleteCategoryDialog
          category={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
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
