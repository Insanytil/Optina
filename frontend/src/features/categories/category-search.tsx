import { categoryPaths } from './category-paths'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import {
  searchCategories,
  type Category,
  type CategorySearchScope,
} from './api'

interface Choice {
  id: string
  label: string
}

export function CategorySearch({
  id,
  value,
  onChange,
  categories,
  paths,
  scope = {},
  disabled = false,
  placeholder = 'Rechercher une catégorie…',
  clearLabel = 'Toutes les catégories',
  invalid,
  describedBy,
  onBlur,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  categories: Category[]
  paths?: Map<string, string>
  scope?: CategorySearchScope
  disabled?: boolean
  placeholder?: string
  clearLabel?: string
  invalid?: boolean
  describedBy?: string
  onBlur?: () => void
}) {
  const labels = useMemo(
    () => paths ?? categoryPaths(categories),
    [paths, categories],
  )
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const term = search.trim().slice(0, 100)
  const debounced = useDebouncedValue(term, 300)
  const waiting = term !== debounced
  const query = useQuery({
    queryKey: ['categories', 'search', term, scope],
    queryFn: ({ signal }) => searchCategories(term, signal, scope),
    enabled: open && !waiting && !disabled,
    staleTime: 30_000,
  })
  const loading = waiting || query.isFetching
  const items: Choice[] = loading
    ? []
    : (query.data ?? []).map((category) => ({
        id: category.id,
        label: labels.get(category.id) ?? category.name,
      }))
  const selected = useMemo<Choice | null>(() => {
    if (!value) return null
    return {
      id: value,
      label:
        labels.get(value) ??
        categories.find((item) => item.id === value)?.name ??
        'Catégorie sélectionnée',
    }
  }, [value, labels, categories])
  return (
    <Combobox<Choice>
      disabled={disabled}
      items={items}
      open={open}
      value={selected}
      filter={null}
      itemToStringLabel={(item) => item.label}
      isItemEqualToValue={(item, current) => item.id === current.id}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) setSearch('')
      }}
      onInputValueChange={(text, details) => {
        if (
          details.reason === 'input-change' ||
          details.reason === 'input-clear' ||
          details.reason === 'clear-press'
        )
          setSearch(text)
      }}
      onValueChange={(item, details) => {
        onChange(item?.id ?? '')
        if (details.reason !== 'input-change') setSearch('')
      }}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onBlur={onBlur}
        showClear={!!value}
        className="h-10 w-full min-w-0"
        maxLength={100}
        aria-busy={loading}
      />
      <ComboboxContent>
        {loading && (
          <p
            role="status"
            className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground"
          >
            <LoaderCircle
              className="size-3.5 animate-spin"
              aria-hidden="true"
            />
            Recherche des catégories…
          </p>
        )}
        {!loading && query.isError && (
          <div className="space-y-2 p-2">
            <p role="alert" className="text-sm text-destructive">
              {query.error.message}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => void query.refetch()}
            >
              Réessayer
            </Button>
          </div>
        )}
        <ComboboxList>
          {(item: Choice) => (
            <ComboboxItem key={item.id} value={item}>
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
            </ComboboxItem>
          )}
        </ComboboxList>
        {!loading && !query.isError && (
          <ComboboxEmpty>Aucune catégorie trouvée.</ComboboxEmpty>
        )}
        {!loading && items.length === 25 && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            25 résultats affichés. Affinez votre recherche.
          </p>
        )}
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            {clearLabel}
          </Button>
        )}
      </ComboboxContent>
    </Combobox>
  )
}
