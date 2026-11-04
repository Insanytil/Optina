import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Folder } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { categoryKeys, categoryPath, listCategories } from './api'
import { CategoryBreadcrumbs } from './category-breadcrumbs'

export function CategoryParentPicker({
  value,
  onChange,
  excludeId,
  disabled,
}: {
  value: string | null
  onChange: (id: string | null) => void
  excludeId?: string
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [browsing, setBrowsing] = useState<string | null>(value)
  const [page, setPage] = useState(1)
  const selectedPath = useQuery({
    queryKey: categoryKeys.path(value),
    queryFn: ({ signal }) => categoryPath(value!, signal),
    enabled: value !== null,
  })
  const path = useQuery({
    queryKey: categoryKeys.path(browsing),
    queryFn: ({ signal }) => categoryPath(browsing!, signal),
    enabled: open && browsing !== null,
  })
  const query = useQuery({
    queryKey: categoryKeys.list(browsing, page),
    queryFn: ({ signal }) => listCategories(browsing, page, signal),
    enabled: open,
  })
  function navigate(id: string | null) {
    setBrowsing(id)
    setPage(1)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <p className="min-w-0 break-words text-sm">
          {value === null
            ? 'Aucune — catégorie principale'
            : (selectedPath.data?.map((item) => item.name).join(' / ') ??
              (selectedPath.isError ? 'Parent indisponible' : 'Chargement…'))}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Fermer' : 'Changer'}
        </Button>
      </div>
      {open && (
        <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
          <CategoryBreadcrumbs path={path.data ?? []} onNavigate={navigate} />
          {path.isError && browsing !== null && (
            <p role="alert" className="text-sm text-destructive">
              {path.error.message}
            </p>
          )}
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={
              disabled || (browsing !== null && (!path.data || path.isError))
            }
            onClick={() => {
              onChange(browsing)
              setOpen(false)
            }}
          >
            {browsing === null
              ? 'Choisir une catégorie principale'
              : 'Choisir ce parent'}
          </Button>
          {query.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              Chargement…
            </p>
          ) : query.isError ? (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {query.error.message}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void query.refetch()}
              >
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {query.data.items
                  .filter((item) => item.id !== excludeId)
                  .map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => navigate(item.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2"
                      >
                        <Folder
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                        </span>
                        <ChevronRight
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  ))}
              </ul>
              {!query.data.items.some((item) => item.id !== excludeId) && (
                <p className="text-sm text-muted-foreground">
                  Aucune catégorie disponible à ce niveau.
                </p>
              )}
              {(query.data.pagination.total_pages > 1 || page > 1) && (
                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Précédent
                  </Button>
                  <span className="text-xs">Page {page}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      disabled || page >= query.data.pagination.total_pages
                    }
                    onClick={() => setPage(page + 1)}
                  >
                    Suivant
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
