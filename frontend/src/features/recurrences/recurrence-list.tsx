import { useId, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Category } from '@/features/categories/api'
import { CategorySearch } from '@/features/categories/category-search'
import { formatBalance } from '@/features/wallets/api'
import { frequencyLabel, type Recurrence } from './api'
import {
  categoryPaths,
  defaultRecurrenceFilters,
  filterRecurrences,
  recurrenceStatus,
  type RecurrenceFilters,
} from './list-filters'

export function RecurrenceList({
  rules,
  categories,
  busy,
  onEdit,
  onToggle,
  onStop,
}: {
  rules: Recurrence[]
  categories: Category[]
  busy: boolean
  onEdit: (rule: Recurrence) => void
  onToggle: (rule: Recurrence) => void
  onStop: (rule: Recurrence) => void
}) {
  const id = useId()
  const [filters, setFilters] = useState<RecurrenceFilters>(
    defaultRecurrenceFilters,
  )
  const [collapsed, setCollapsed] = useState({ income: false, expense: false })
  const filtered = filterRecurrences(rules, categories, filters)
  const paths = categoryPaths(categories)
  const select =
    'h-10 w-full min-w-0 rounded-md border bg-background px-3 text-sm'
  const groups = [
    {
      type: 'income' as const,
      label: 'Rentrées régulières',
      icon: ArrowDownLeft,
      color: 'text-emerald-500',
    },
    {
      type: 'expense' as const,
      label: 'Dépenses régulières',
      icon: ArrowUpRight,
      color: 'text-rose-400',
    },
  ]
  return (
    <div className="space-y-4">
      <div
        className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 xl:grid-cols-5"
        aria-label="Filtres de la liste des récurrences"
      >
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-search`}>Rechercher</Label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder="Libellé ou catégorie…"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-type`}>Type</Label>
          <select
            id={`${id}-type`}
            className={select}
            value={filters.type}
            onChange={(e) =>
              setFilters({
                ...filters,
                type: e.target.value as RecurrenceFilters['type'],
              })
            }
          >
            <option value="all">Rentrées et dépenses</option>
            <option value="income">Rentrées</option>
            <option value="expense">Dépenses</option>
          </select>
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor={`${id}-category`}>Catégorie et sous-catégories</Label>
          <CategorySearch
            id={`${id}-category`}
            value={filters.categoryId}
            onChange={(categoryId) => setFilters({ ...filters, categoryId })}
            categories={categories}
            paths={paths}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-status`}>État</Label>
          <select
            id={`${id}-status`}
            className={select}
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
        <div className="space-y-2">
          <Label htmlFor={`${id}-sort`}>Trier par</Label>
          <select
            id={`${id}-sort`}
            className={select}
            value={filters.sort}
            onChange={(e) =>
              setFilters({
                ...filters,
                sort: e.target.value as RecurrenceFilters['sort'],
              })
            }
          >
            <option value="date">Prochaine échéance</option>
            <option value="category">Catégorie</option>
            <option value="amount-desc">Montant décroissant</option>
            <option value="amount-asc">Montant croissant</option>
            <option value="label">Libellé</option>
          </select>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-muted-foreground">
          {filtered.length} récurrence{filtered.length !== 1 ? 's' : ''}{' '}
          affichée{filtered.length !== 1 ? 's' : ''} sur {rules.length}
        </p>
        <div className="flex flex-wrap gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters(defaultRecurrenceFilters)}
          >
            Réinitialiser les filtres
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed({ income: true, expense: true })}
          >
            Tout replier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed({ income: false, expense: false })}
          >
            Tout déplier
          </Button>
        </div>
      </div>
      {filtered.length === 0 && (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucune récurrence ne correspond à ces filtres.
        </p>
      )}
      {groups
        .filter(
          (group) => filters.type === 'all' || filters.type === group.type,
        )
        .map((group) => {
          const items = filtered.filter((rule) => rule.type === group.type)
          const total = rules.filter((rule) => rule.type === group.type).length
          const Icon = group.icon
          const Chevron = collapsed[group.type] ? ChevronRight : ChevronDown
          return (
            <section
              key={group.type}
              className="overflow-hidden rounded-xl border bg-card"
              aria-labelledby={`${id}-${group.type}-title`}
            >
              <h3 id={`${id}-${group.type}-title`}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 p-4 text-left font-semibold hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
                  aria-expanded={!collapsed[group.type]}
                  aria-controls={`${id}-${group.type}-content`}
                  onClick={() =>
                    setCollapsed({
                      ...collapsed,
                      [group.type]: !collapsed[group.type],
                    })
                  }
                >
                  <Chevron
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Icon
                    className={`size-4 shrink-0 ${group.color}`}
                    aria-hidden="true"
                  />
                  <span>{group.label}</span>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {items.length} / {total}
                  </span>
                </button>
              </h3>
              <div
                id={`${id}-${group.type}-content`}
                hidden={collapsed[group.type]}
                className="border-t p-3 sm:p-4"
              >
                {items.length === 0 ? (
                  <p className="py-5 text-center text-sm text-muted-foreground">
                    {total
                      ? 'Aucune récurrence de ce groupe ne correspond aux filtres.'
                      : 'Aucune récurrence dans ce groupe.'}
                  </p>
                ) : (
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {items.map((rule) => {
                      const status = recurrenceStatus(rule)
                      const category =
                        paths.get(rule.category_id) ?? 'Catégorie'
                      return (
                        <li
                          key={rule.id}
                          className="flex min-w-0 flex-wrap items-start justify-between gap-4 rounded-lg border bg-background/40 p-4"
                        >
                          <div className="min-w-0 flex-1">
                            <h4 className="break-words font-medium">
                              {rule.label}
                            </h4>
                            <p
                              className={`mt-1 font-semibold tabular-nums ${group.color}`}
                            >
                              {rule.type === 'income' ? '+' : '−'}
                              {formatBalance(rule.amount)}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {frequencyLabel(rule)}
                            </p>
                            <p
                              className="mt-1 truncate text-xs text-muted-foreground"
                              title={category}
                            >
                              {category}
                            </p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {status === 'ended'
                                ? 'Terminée'
                                : status === 'paused'
                                  ? 'En pause'
                                  : `Prochaine échéance : ${new Date(`${rule.next_date}T12:00:00`).toLocaleDateString('fr-BE')}`}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => onEdit(rule)}
                              aria-label={`Modifier ${rule.label}`}
                            >
                              Modifier
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={busy || status === 'ended'}
                              onClick={() => onToggle(rule)}
                              aria-label={`${rule.is_active ? 'Suspendre' : 'Reprendre'} ${rule.label}`}
                            >
                              {rule.is_active ? 'Suspendre' : 'Reprendre'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() => onStop(rule)}
                              aria-label={`Arrêter ${rule.label}`}
                            >
                              Arrêter
                            </Button>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </section>
          )
        })}
    </div>
  )
}
