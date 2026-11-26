import { useCallback, useId, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Search,
  SlidersHorizontal,
  Square,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { Category } from '@/features/categories/api'
import { CategorySearch } from '@/features/categories/category-search'
import { formatBalance } from '@/features/wallets/api'
import { cn } from 'cn'
import { frequencyLabel } from './api'
import type { Recurrence } from './api'
import {
  categoryPaths,
  defaultRecurrenceFilters,
  filterRecurrences,
  recurrenceStatus,
} from './list-filters'
import type { RecurrenceFilters } from './list-filters'

const COLS =
  'grid grid-cols-[minmax(0,1fr)_auto_2rem] items-center gap-3 md:grid-cols-[minmax(0,1fr)_9rem_8rem_7rem_6rem_2rem]'

const STATUS = {
  active: {
    label: 'Active',
    className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  paused: {
    label: 'En pause',
    className: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  },
  ended: { label: 'Terminée', className: 'bg-muted text-muted-foreground' },
}

const nextLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('fr-BE', {
    day: '2-digit',
    month: '2-digit',
  })

type SortKey = 'label' | 'date' | 'amount' | 'category'
const sortKeyOf = (sort: RecurrenceFilters['sort']): SortKey =>
  sort.startsWith('amount') ? 'amount' : (sort as SortKey)

/** A column title that sorts the table; declared at module level so it keeps focus across renders. */
function SortHeader({
  k,
  sort,
  onSort,
  children,
  className,
}: {
  k: SortKey
  sort: RecurrenceFilters['sort']
  onSort: (key: SortKey) => void
  children: ReactNode
  className?: string
}) {
  const active = sortKeyOf(sort) === k
  const Arrow = sort === 'amount-asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm uppercase hover:text-foreground focus-visible:outline-2',
        active && 'text-foreground',
        className,
      )}
    >
      {children}
      {active && <Arrow className="size-3" aria-hidden="true" />}
    </button>
  )
}

export function RecurrenceList({
  rules,
  categories,
  busy,
  toolbarStart,
  onEdit,
  onToggle,
  onStop,
}: {
  rules: Recurrence[]
  categories: Category[]
  busy: boolean
  toolbarStart?: ReactNode
  onEdit: (rule: Recurrence) => void
  onToggle: (rule: Recurrence) => void
  onStop: (rule: Recurrence) => void
}) {
  const id = useId()
  const [toolbarHeight, setToolbarHeight] = useState(0)
  // Track the toolbar height so the sticky column header sits just below it.
  const toolbar = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    setToolbarHeight(node.offsetHeight)
    const observer = new ResizeObserver(() =>
      setToolbarHeight(node.offsetHeight),
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const [filters, setFilters] = useState<RecurrenceFilters>(
    defaultRecurrenceFilters,
  )
  const [collapsed, setCollapsed] = useState({ income: false, expense: false })
  const filtered = filterRecurrences(rules, categories, filters)
  const paths = categoryPaths(categories)
  const extraFilters =
    Number(!!filters.categoryId) + Number(filters.status !== 'all')
  const filtering = filtered.length !== rules.length

  function sortBy(key: SortKey) {
    const sort: RecurrenceFilters['sort'] =
      key === 'amount'
        ? filters.sort === 'amount-desc'
          ? 'amount-asc'
          : 'amount-desc'
        : key
    setFilters({ ...filters, sort })
  }
  const groups = [
    { type: 'income' as const, label: 'Rentrées' },
    { type: 'expense' as const, label: 'Dépenses' },
  ].filter((group) => filters.type === 'all' || filters.type === group.type)

  return (
    <div
      className="space-y-3"
      style={{ '--toolbar-h': `${toolbarHeight}px` } as CSSProperties}
    >
      {/* Toolbar and column header stay on screen while the page scrolls. */}
      <div
        ref={toolbar}
        className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2 bg-background px-1 py-2"
        aria-label="Filtres des récurrences"
        role="group"
      >
        {toolbarStart}
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Rechercher un libellé ou une catégorie"
            placeholder="Rechercher un libellé ou une catégorie…"
            className="pl-8"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Type"
          className="inline-flex overflow-hidden rounded-md border"
        >
          {(
            [
              ['all', 'Toutes'],
              ['income', 'Rentrées'],
              ['expense', 'Dépenses'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filters.type === value}
              onClick={() => setFilters({ ...filters, type: value })}
              className={cn(
                'px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px]',
                filters.type === value &&
                  'bg-muted font-medium text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" />}>
            <SlidersHorizontal aria-hidden="true" />
            Filtres
            {extraFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {extraFilters}
              </span>
            )}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-category`}>
                Catégorie et sous-catégories
              </Label>
              <CategorySearch
                id={`${id}-category`}
                value={filters.categoryId}
                onChange={(categoryId) =>
                  setFilters({ ...filters, categoryId })
                }
                categories={categories}
                paths={paths}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-status`}>État</Label>
              <select
                id={`${id}-status`}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={filters.status}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    status: e.target.value as RecurrenceFilters['status'],
                  })
                }
              >
                <option value="all">Tous les états</option>
                <option value="active">Actives</option>
                <option value="paused">En pause</option>
                <option value="ended">Terminées</option>
              </select>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {filtering && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <p role="status">
            {filtered.length} sur {rules.length} récurrence
            {rules.length !== 1 ? 's' : ''}
          </p>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-xs"
            onClick={() => setFilters(defaultRecurrenceFilters)}
          >
            Réinitialiser
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune récurrence ne correspond à ces filtres.
        </p>
      ) : (
        <div className="overflow-clip rounded-xl border bg-card text-sm">
          <div
            className={cn(
              COLS,
              'sticky top-[var(--toolbar-h)] z-10 bg-muted px-4 py-2 text-xs font-medium tracking-wide text-muted-foreground',
            )}
          >
            <SortHeader sort={filters.sort} onSort={sortBy} k="label">
              Libellé
            </SortHeader>
            <span className="hidden md:block">Fréquence</span>
            <SortHeader
              sort={filters.sort}
              onSort={sortBy}
              k="date"
              className="hidden md:inline-flex"
            >
              Prochaine
            </SortHeader>
            <SortHeader
              sort={filters.sort}
              onSort={sortBy}
              k="amount"
              className="justify-self-end"
            >
              Montant
            </SortHeader>
            <span className="hidden md:block">État</span>
            <span className="sr-only">Actions</span>
          </div>
          {groups.map((group) => {
            const items = filtered.filter((rule) => rule.type === group.type)
            if (!items.length) return null
            const open = !collapsed[group.type]
            const Chevron = open ? ChevronDown : ChevronRight
            return (
              <section key={group.type} aria-label={group.label}>
                <h3 className="border-t">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed({ ...collapsed, [group.type]: open })
                    }
                    className="flex w-full items-center gap-2 bg-muted/25 px-4 py-2 text-left text-xs font-semibold hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  >
                    <Chevron
                      className="size-3.5 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {group.label}
                    <span className="font-normal text-muted-foreground tabular-nums">
                      {items.length}
                    </span>
                  </button>
                </h3>
                {open && (
                  <ul>
                    {items.map((rule) => (
                      <Row
                        key={rule.id}
                        rule={rule}
                        category={paths.get(rule.category_id) ?? 'Catégorie'}
                        busy={busy}
                        onEdit={onEdit}
                        onToggle={onToggle}
                        onStop={onStop}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Row({
  rule,
  category,
  busy,
  onEdit,
  onToggle,
  onStop,
}: {
  rule: Recurrence
  category: string
  busy: boolean
  onEdit: (rule: Recurrence) => void
  onToggle: (rule: Recurrence) => void
  onStop: (rule: Recurrence) => void
}) {
  const status = recurrenceStatus(rule)
  const next =
    status === 'active' && rule.next_date ? nextLabel(rule.next_date) : null
  const income = rule.type === 'income'
  const badge = STATUS[status]
  return (
    <li
      className={cn(
        COLS,
        'group relative border-t px-4 py-2.5 hover:bg-muted/40',
        status !== 'active' && 'text-muted-foreground',
      )}
    >
      <div className="min-w-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(rule)}
          className="block max-w-full truncate rounded-sm text-left font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          title={rule.label}
        >
          {rule.label}
        </button>
        <p className="truncate text-xs text-muted-foreground" title={category}>
          {category}
          <span className="md:hidden">
            {' · '}
            {frequencyLabel(rule)}
            {next
              ? ` · ${next}`
              : status !== 'active'
                ? ` · ${badge.label}`
                : ''}
          </span>
        </p>
      </div>
      <span className="hidden truncate text-muted-foreground md:block">
        {frequencyLabel(rule)}
      </span>
      <span className="hidden tabular-nums md:block">{next ?? '—'}</span>
      <span
        className={cn(
          'justify-self-end font-medium tabular-nums',
          status === 'active' &&
            (income
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-rose-600 dark:text-rose-400'),
        )}
      >
        {income ? '+' : '−'}
        {formatBalance(rule.amount)}
      </span>
      <span
        className={cn(
          'hidden w-fit rounded-full px-2 py-0.5 text-xs font-medium md:inline-block',
          badge.className,
        )}
      >
        {badge.label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={busy}
              className="relative z-10 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 md:data-[popup-open]:opacity-100"
              aria-label={`Actions pour ${rule.label}`}
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => onEdit(rule)}>
            <Pencil />
            Modifier
          </DropdownMenuItem>
          {status !== 'ended' && (
            <DropdownMenuItem
              onClick={() => onToggle(rule)}
              title={
                rule.is_active
                  ? 'Les échéances pendant la pause sont ignorées ; la reprise garde le calendrier initial.'
                  : undefined
              }
            >
              {rule.is_active ? <Pause /> : <Play />}
              {rule.is_active ? 'Suspendre' : 'Reprendre'}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => onStop(rule)}>
            <Square />
            Arrêter…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}
