import { FolderPlus, MoreHorizontal, Move, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { Category, CategoryUsage } from './api'
import { CategoryForm } from './category-form'
import { NO_USAGE } from './category-usage'
import type { CategoryRowActions } from './category-tree'
import type { CategoryIndex } from './tree'
import { ancestorNames } from './tree'

export type SheetMode =
  { kind: 'edit'; id: string } | { kind: 'new'; parentId: string | null }

const plural = (value: number, word: string) =>
  `${value} ${word}${value > 1 ? 's' : ''}`

function UsageBadges({ usage }: { usage: CategoryUsage | undefined }) {
  const values = usage ?? NO_USAGE
  return (
    <section className="space-y-1.5">
      <h3 className="text-sm font-medium">Utilisation</h3>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">
          {plural(values.transactions, 'transaction')}
        </Badge>
        <Badge variant="secondary">
          {plural(values.recurrences, 'récurrence')}
        </Badge>
        <Badge variant="secondary">{plural(values.budgets, 'budget')}</Badge>
      </div>
    </section>
  )
}

function MoreMenu({
  category,
  actions,
}: {
  category: Category
  actions: Omit<CategoryRowActions, 'onEdit'>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="sm" />}
      >
        <MoreHorizontal aria-hidden="true" />
        Plus
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
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

/** Content of the right-hand sheet: create or edit one category. */
export function CategorySheetContent({
  mode,
  index,
  usage,
  colors,
  actions,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  mode: SheetMode
  index: CategoryIndex
  usage: Map<string, CategoryUsage>
  colors: Map<string, string>
  actions: Omit<CategoryRowActions, 'onEdit'>
  onSaved: (category: Category) => void
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const category = mode.kind === 'edit' ? index.byId.get(mode.id) : undefined
  const parentId =
    mode.kind === 'new' ? mode.parentId : (category?.parent_id ?? null)
  const parent = parentId ? index.byId.get(parentId) : undefined
  const path = category
    ? ancestorNames(index, category.id)
    : parent
      ? [...ancestorNames(index, parent.id), parent.name]
      : []
  const title = category
    ? category.name
    : parent
      ? 'Nouvelle sous-catégorie'
      : 'Nouvelle catégorie'
  return (
    <>
      <SheetHeader className="gap-0.5 border-b px-5 py-4">
        <SheetDescription className="truncate text-xs">
          {path.length > 0 ? `${path.join(' › ')} ›` : 'Catégorie principale'}
        </SheetDescription>
        <SheetTitle className="truncate pr-8 text-lg">{title}</SheetTitle>
      </SheetHeader>
      <CategoryForm
        // Remount after a save so the form shows the stored values.
        key={
          category ? `${category.id}:${category.updated_at}` : `new-${parentId}`
        }
        category={category}
        initialParentId={parentId}
        colors={colors}
        onSaved={onSaved}
        onCancel={onCancel}
        onDirtyChange={onDirtyChange}
        actions={category && <MoreMenu category={category} actions={actions} />}
      >
        {category && <UsageBadges usage={usage.get(category.id)} />}
      </CategoryForm>
    </>
  )
}
