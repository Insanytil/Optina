import { useId } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Label } from '@/components/ui/label'
import { categoryKeys, loadCategoryTree } from './api'
import { CategorySearch } from './category-search'

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
  const id = useId()
  const tree = useQuery({
    queryKey: categoryKeys.tree,
    queryFn: ({ signal }) => loadCategoryTree(signal),
  })
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="sr-only">
        Catégorie parente
      </Label>
      <CategorySearch
        id={id}
        value={value ?? ''}
        onChange={(next) => onChange(next || null)}
        categories={tree.data ?? []}
        scope={{ excludeId }}
        disabled={disabled}
        placeholder="Aucune — catégorie principale"
        clearLabel="Aucune — catégorie principale"
      />
      <p className="text-xs text-muted-foreground">
        Recherchez un parent ou laissez le champ vide pour une catégorie
        principale.
      </p>
      {tree.isError && (
        <p role="alert" className="text-sm text-destructive">
          {tree.error.message}
        </p>
      )}
    </div>
  )
}
