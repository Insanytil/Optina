import { useEffect, useMemo, useState } from 'react'
import type { DragEvent } from 'react'
import {
  ArrowDownToLine,
  ChevronDown,
  ChevronRight,
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
import { WalletSwatch } from '@/features/calendar/wallet-filter'
import { cn } from 'cn'
import type { Category, CategoryPlacement, CategoryUsage } from './api'
import {
  dropPlacement,
  indexCategories,
  searchTree,
  visibleCategories,
} from './tree'
import type { DropZone } from './tree'

export interface CategoryRowActions {
  onEdit: (category: Category) => void
  onCreateChild: (category: Category) => void
  onMove: (category: Category) => void
  onDelete: (category: Category) => void
}

/** Shared by the header and the rows so the columns line up. */
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_2rem] items-center md:grid-cols-[minmax(0,1fr)_10rem_6rem_6rem_2rem]'

const countCell = (value: number | undefined) =>
  value ? value.toLocaleString('fr-FR') : '—'

function WalletsCell({
  category,
  colors,
  walletNames,
}: {
  category: Category
  colors: Map<string, string>
  walletNames: Map<string, string>
}) {
  const ids = category.wallet_ids
  if (ids === null || ids === undefined)
    return (
      <span className="text-xs text-muted-foreground">
        {category.parent_id ? 'Hérité' : 'Tous'}
      </span>
    )
  if (ids.length === 0)
    return <span className="text-xs text-muted-foreground">Aucun</span>
  return (
    <span
      className="flex min-w-0 items-center gap-1"
      title={ids.map((id) => walletNames.get(id) ?? '').join(', ')}
    >
      {ids.map((id) => (
        <WalletSwatch key={id} color={colors.get(id) ?? 'currentColor'} />
      ))}
      {ids.length === 1 && (
        <span className="truncate text-xs text-muted-foreground">
          {walletNames.get(ids[0])}
        </span>
      )}
    </span>
  )
}

function RowMenu({
  category,
  disabled,
  actions,
}: {
  category: Category
  disabled: boolean
  actions: CategoryRowActions
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            className="md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[popup-open]:opacity-100"
            aria-label={`Actions pour ${category.name}`}
          />
        }
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={() => actions.onEdit(category)}>
          <Pencil />
          Modifier
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onCreateChild(category)}>
          <FolderPlus />
          Ajouter une sous-catégorie
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => actions.onMove(category)}>
          <Move />
          Déplacer vers…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => actions.onDelete(category)}
        >
          <Trash2 />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CategoryTree({
  categories,
  expanded,
  onExpandedChange,
  busy,
  query,
  highlightedId,
  usage,
  colors,
  walletNames,
  actions,
  onDrop,
}: {
  categories: Category[]
  expanded: Set<string>
  onExpandedChange: (expanded: Set<string>) => void
  busy: boolean
  /** Filters the tree; matches are shown with their ancestors. */
  query: string
  /** Row being edited or just created. */
  highlightedId: string | null
  usage: Map<string, CategoryUsage>
  colors: Map<string, string>
  walletNames: Map<string, string>
  actions: CategoryRowActions
  onDrop: (id: string, placement: CategoryPlacement) => void
}) {
  const index = useMemo(() => indexCategories(categories), [categories])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [target, setTarget] = useState<{
    id: string | null
    zone: DropZone
  } | null>(null)
  const search = useMemo(() => searchTree(index, query), [index, query])
  // While searching, show matches in context and disable dragging.
  const rows = search
    ? visibleCategories(index, search.open).filter(({ category }) =>
        search.shown.has(category.id),
      )
    : visibleCategories(index, expanded, activeId)
  const canDrag = !busy && !search

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
    if (!activeId || !canDrag) return
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
    <div className="space-y-2" aria-busy={busy}>
      <div
        className="overflow-hidden rounded-xl border bg-card"
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setTarget(null)
        }}
      >
        <div
          aria-hidden="true"
          className={cn(
            COLUMNS,
            'gap-2 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground',
          )}
        >
          <span className="pl-8 md:pl-16">Nom</span>
          <span className="hidden md:block">Portefeuilles</span>
          <span className="hidden text-right md:block">Transactions</span>
          <span className="hidden text-right md:block">Récurrences</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Aucune catégorie ne correspond à « {query.trim()} ».
          </p>
        ) : (
          <ul aria-label="Arborescence des catégories">
            {rows.map(({ category, depth }) => {
              const children = index.children.get(category.id) ?? []
              const open = search
                ? search.open.has(category.id)
                : expanded.has(category.id)
              const zone = target?.id === category.id ? target.zone : null
              const counts = usage.get(category.id)
              return (
                <li
                  key={category.id}
                  className="relative border-t first:border-t-0"
                  data-category-row
                  onDragOver={(event) => dragOver(event, category.id)}
                  onDrop={drop}
                >
                  {zone === 'before' && (
                    <div className="pointer-events-none absolute inset-x-2 top-0 z-10 h-0.5 rounded bg-primary" />
                  )}
                  <div
                    className={cn(
                      COLUMNS,
                      'group gap-2 px-3 transition-colors',
                      activeId === category.id && 'opacity-40',
                      zone === 'inside'
                        ? 'bg-accent ring-2 ring-inset ring-primary'
                        : category.id === highlightedId
                          ? 'bg-primary/10'
                          : 'hover:bg-muted/50',
                    )}
                  >
                    <div
                      className="flex min-w-0 items-center gap-0.5"
                      style={{ paddingLeft: `${depth * 20}px` }}
                    >
                      {/* Mouse-only shortcut; "Déplacer vers…" covers the keyboard. */}
                      <span
                        draggable={canDrag}
                        aria-hidden="true"
                        title="Glisser entre deux lignes pour réordonner, ou au centre d’une ligne pour en faire une sous-catégorie"
                        className={cn(
                          'hidden size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 md:flex',
                          canDrag
                            ? 'cursor-grab active:cursor-grabbing'
                            : 'invisible',
                        )}
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
                        <GripVertical className="size-4" />
                      </span>
                      {children.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={!!search}
                          aria-expanded={open}
                          aria-label={`${open ? 'Replier' : 'Déplier'} ${category.name}`}
                          onClick={() => toggle(category.id)}
                        >
                          {open ? <ChevronDown /> : <ChevronRight />}
                        </Button>
                      ) : (
                        <span className="w-7 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => actions.onEdit(category)}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-2.5 pl-1 text-left text-sm focus-visible:outline-2"
                      >
                        <span
                          className={cn(
                            'min-w-0 truncate',
                            depth === 0 && 'font-medium',
                          )}
                          title={category.name}
                        >
                          <span className="sr-only">
                            Modifier, niveau {depth + 1} :{' '}
                          </span>
                          {category.name}
                        </span>
                        {children.length > 0 && (
                          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                            {children.length}
                          </span>
                        )}
                        {/* Phone: the wallet column is hidden, keep the dots by the name. */}
                        <span className="md:hidden">
                          {category.wallet_ids && (
                            <WalletsCell
                              category={category}
                              colors={colors}
                              walletNames={new Map()}
                            />
                          )}
                        </span>
                        {zone === 'inside' && (
                          <span className="shrink-0 text-xs text-primary">
                            Déplacer ici
                          </span>
                        )}
                      </button>
                    </div>
                    <span className="hidden min-w-0 md:block">
                      <WalletsCell
                        category={category}
                        colors={colors}
                        walletNames={walletNames}
                      />
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                      {countCell(counts?.transactions)}
                    </span>
                    <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                      {countCell(counts?.recurrences)}
                    </span>
                    <RowMenu
                      category={category}
                      disabled={busy}
                      actions={actions}
                    />
                  </div>
                  {zone === 'after' && (
                    <div className="pointer-events-none absolute inset-x-2 bottom-0 z-10 h-0.5 rounded bg-primary" />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {activeId && (
        <div
          onDragOver={(event) => dragOver(event, null)}
          onDrop={drop}
          className={cn(
            'flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm',
            target?.id === null
              ? 'border-primary bg-accent'
              : 'border-border text-muted-foreground',
          )}
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
