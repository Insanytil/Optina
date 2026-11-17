import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { SavedView, ViewConfig } from './api'
export function ViewToolbar({
  status,
  onStatus,
  from,
  to,
  onRange,
  viewId,
  views,
  onView,
  onSave,
  onDelete,
  canSave,
  modified,
}: {
  status: ViewConfig['status']
  onStatus: (status: ViewConfig['status']) => void
  from: string
  to: string
  onRange: (from: string, to: string) => void
  viewId: string
  views: SavedView[]
  onView: (id: string) => void
  onSave: () => void
  onDelete: () => void
  canSave: boolean
  modified: boolean
}) {
  return (
    <div className="space-y-4">
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Périodes des budgets"
      >
        {[
          { id: 'active', label: 'Budgets en cours' },
          { id: 'upcoming', label: 'À venir' },
          { id: 'ended', label: 'Historique' },
          { id: 'all', label: 'Toutes les périodes' },
        ].map((item) => (
          <Button
            key={item.id}
            className="min-h-11"
            aria-pressed={status === item.id}
            variant={status === item.id ? 'default' : 'outline'}
            onClick={() => onStatus(item.id as ViewConfig['status'])}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          {status === 'active' ? (
            <p className="text-sm text-muted-foreground">
              Budgets dont la période est en cours aujourd’hui.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="budget-from">Du</Label>
                <Input
                  id="budget-from"
                  type="date"
                  min="1900-01-01"
                  max="9998-12-31"
                  value={from}
                  onChange={(event) => onRange(event.target.value, to)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-to">Au</Label>
                <Input
                  id="budget-to"
                  type="date"
                  min={from}
                  max="9998-12-31"
                  value={to}
                  onChange={(event) => onRange(from, event.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {views.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="budget-view">Vue enregistrée</Label>
              <select
                id="budget-view"
                className="h-10 max-w-64 rounded-lg border bg-background px-3 text-sm"
                value={viewId}
                onChange={(event) => onView(event.target.value)}
              >
                <option value="">Vue personnalisée</option>
                {views.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                    {view.is_default ? ' · Par défaut' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          <Button
            variant="outline"
            className="min-h-10"
            disabled={!canSave}
            onClick={onSave}
          >
            <Save aria-hidden="true" />
            Enregistrer ma vue
          </Button>
          {viewId && (
            <Button
              variant="ghost"
              size="icon-lg"
              aria-label="Supprimer cette vue"
              onClick={onDelete}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
          {modified && (
            <p className="w-full text-xs text-muted-foreground" role="status">
              Filtres modifiés, non enregistrés.
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Chaque ligne ou carte représente une période indépendante. Aucun montant
        inutilisé n’est reporté sur la suivante.
      </p>
    </div>
  )
}
