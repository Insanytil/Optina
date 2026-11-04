import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MoreHorizontal,
  Move,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Category, CategoryPlacement } from './api'
import { dropPlacement, indexCategories, visibleCategories } from './tree'
import type { DropZone } from './tree'

export function CategoryTree({
  categories,
  expanded,
  onExpandedChange,
  busy,
  onCreate,
  onEdit,
  onDelete,
  onMove,
  onDrop,
}: {
  categories: Category[]
  expanded: Set<string>
  onExpandedChange: (expanded: Set<string>) => void
  busy: boolean
  onCreate: (parentId: string) => void
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
  onMove: (category: Category) => void
  onDrop: (id: string, placement: CategoryPlacement) => void
}) {
  const index = useMemo(() => indexCategories(categories), [categories])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<{
    id: string | null
    zone: DropZone
  } | null>(null)
  const rows = visibleCategories(index, expanded, activeId)

  useEffect(() => {
    if (
      !activeId ||
      !target?.id ||
      target.zone !== 'inside' ||
      expanded.has(target.id)
    )
      return
    const identifier = target.id
    const timer = window.setTimeout(
      () => onExpandedChange(new Set([...expanded, identifier])),
      700,
    )
    return () => window.clearTimeout(timer)
  }, [activeId, target?.id, target?.zone, expanded, onExpandedChange])

  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onExpandedChange(next)
  }
  function dragOver(event: DragEvent<HTMLElement>, id: string | null) {
    if (!activeId || busy) return
    const rect = event.currentTarget.getBoundingClientRect()
    const fraction = (event.clientY - rect.top) / rect.height
    const zone: DropZone =
      id === null
        ? 'inside'
        : fraction < 0.25
          ? 'before'
          : fraction > 0.75
            ? 'after'
            : 'inside'
    if (!dropPlacement(index, activeId, id, zone)) {
      setTarget(null)
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setTarget((previous) =>
      previous?.id === id && previous.zone === zone ? previous : { id, zone },
    )
  }
  function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    if (activeId && target && !busy) {
      const placement = dropPlacement(index, activeId, target.id, target.zone)
      if (placement) onDrop(activeId, placement)
    }
    setActiveId(null)
    setTarget(null)
  }
  return (
    <div className="space-y-3" aria-busy={busy}>
      <p id="category-drag-help" className="text-xs text-muted-foreground">
        Glissez la poignée pour déplacer une catégorie. Déposez entre deux
        lignes pour les réordonner, ou au centre d’une ligne pour en faire une
        sous-catégorie. Le menu propose aussi « Déplacer vers… ».
      </p>
      <div
        className="overflow-x-auto rounded-xl border bg-card"
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setTarget(null)
        }}
      >
        <ul
          aria-label="Arborescence des catégories"
          className="min-w-full w-max py-2"
        >
          {rows.map(({ category, depth }) => {
            const children = index.children.get(category.id) ?? []
            const open = expanded.has(category.id)
            const isTarget = target?.id === category.id
            const zone = isTarget ? target.zone : null
            return (
              <li
                key={category.id}
                className="relative"
                data-category-row
                style={{ paddingLeft: `${depth * 24 + 8}px` }}
                onDragOver={(event) => dragOver(event, category.id)}
                onDrop={drop}
              >
                {zone === 'before' && (
                  <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-0.5 rounded bg-primary" />
                )}
                <div
                  className={`flex items-center gap-1 rounded-lg py-2 pr-3 ${activeId === category.id ? 'opacity-40' : ''} ${zone === 'inside' ? 'bg-accent ring-2 ring-inset ring-primary' : 'hover:bg-muted/50'}`}
                >
                  <button
                    type="button"
                    draggable={!busy}
                    disabled={busy}
                    className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 active:cursor-grabbing disabled:opacity-50"
                    aria-label={`Déplacer ${category.name}`}
                    aria-describedby="category-drag-help"
                    onClick={() => onMove(category)}
                    onDragStart={(event) => {
                      setActiveId(category.id)
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', category.id)
                      const row = event.currentTarget.closest(
                        '[data-category-row]',
                      )
                      if (row) event.dataTransfer.setDragImage(row, 20, 20)
                    }}
                    onDragEnd={() => {
                      setActiveId(null)
                      setTarget(null)
                    }}
                  >
                    <GripVertical className="size-4" aria-hidden="true" />
                  </button>
                  {children.length > 0 ? (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-expanded={open}
                      aria-label={`${open ? 'Replier' : 'Déplier'} ${category.name}`}
                      onClick={() => toggle(category.id)}
                    >
                      {open ? <ChevronDown /> : <ChevronRight />}
                    </Button>
                  ) : (
                    <span className="w-7 shrink-0" />
                  )}
                  {open && children.length > 0 ? (
                    <FolderOpen
                      className="mx-2 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <Folder
                      className="mx-2 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className="mr-6 min-w-28 flex-1 truncate text-sm font-medium max-w-80"
                    title={category.name}
                  >
                    <span className="sr-only">Niveau {depth + 1}. </span>
                    {category.name}
                  </span>
                  {children.length > 0 && (
                    <span className="mr-2 text-xs tabular-nums text-muted-foreground">
                      {children.length}
                    </span>
                  )}
                  {zone === 'inside' && (
                    <span className="mr-2 text-xs text-primary">
                      Déplacer ici
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={`Ajouter une sous-catégorie à ${category.name}`}
                    title="Ajouter une sous-catégorie"
                    onClick={() => onCreate(category.id)}
                  >
                    <FolderPlus aria-hidden="true" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={busy}
                          aria-label={`Actions pour ${category.name}`}
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => onEdit(category)}>
                        <Pencil />
                        Modifier
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onMove(category)}>
                        <Move />
                        Déplacer vers…
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => onDelete(category)}
                      >
                        <Trash2 />
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {zone === 'after' && (
                  <div className="pointer-events-none absolute inset-x-2 bottom-0 z-10 h-0.5 rounded bg-primary" />
                )}
              </li>
            )
          })}
        </ul>
      </div>
      {activeId && (
        <div
          onDragOver={(event) => dragOver(event, null)}
          onDrop={drop}
          className={`flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm ${target?.id === null ? 'border-primary bg-accent' : 'border-border text-muted-foreground'}`}
        >
          <ArrowDownToLine className="size-4" aria-hidden="true" />
          Déposer ici pour en faire une catégorie principale
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {target
          ? target.id === null
            ? 'Destination : catégories principales'
            : `${target.zone === 'inside' ? 'Dans' : target.zone === 'before' ? 'Avant' : 'Après'} ${index.byId.get(target.id)?.name ?? ''}`
          : ''}
      </span>
    </div>
  )
}
