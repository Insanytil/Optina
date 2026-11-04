import { ChevronRight } from 'lucide-react'
import type { Category } from './api'

export function CategoryBreadcrumbs({
  path,
  onNavigate,
}: {
  path: Category[]
  onNavigate: (id: string | null) => void
}) {
  return (
    <nav aria-label="Chemin des catégories" className="overflow-x-auto">
      <ol className="flex items-center gap-2 py-1 text-sm whitespace-nowrap">
        <li>
          <button
            type="button"
            onClick={() => onNavigate(null)}
            className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2"
          >
            Toutes les catégories
          </button>
        </li>
        {path.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2">
            <ChevronRight
              className="size-3 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <button
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={index === path.length - 1 ? 'location' : undefined}
              className="max-w-52 truncate rounded-sm font-medium focus-visible:outline-2"
              title={item.name}
            >
              {item.name}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
