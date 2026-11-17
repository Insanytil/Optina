import { ChevronDown, RotateCcw, SlidersHorizontal } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { CategorySearch } from '@/features/categories/category-search'
import type { Category } from '@/features/categories/api'
import type { Wallet } from '@/features/wallets/api'
import type { Budget, ViewConfig, PeriodType } from './api'
import { periodLabels } from './periods'
const toggle = (items: string[], id: string) =>
  items.includes(id) ? items.filter((item) => item !== id) : [...items, id]
export function ViewSettings({
  config,
  onChange,
  categories,
  wallets,
  goals,
  onReset,
}: {
  config: ViewConfig
  onChange: (config: ViewConfig) => void
  categories: Category[]
  wallets: Wallet[]
  goals: Budget[]
  onReset: () => void
}) {
  const select =
    'h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring'
  const selected =
    config.wallet_ids.length +
    config.category_ids.length +
    config.budget_ids.length +
    (config.status !== 'all' ? 1 : 0)
  return (
    <details className="group/filters rounded-xl border bg-card">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal
          className="size-4 text-muted-foreground"
          aria-hidden="true"
        />
        Filtres et affichage
        <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="hidden sm:inline">
            {config.period_types.map((type) => periodLabels[type]).join(' · ')}
          </span>
          {selected > 0 && <span>{selected} filtre(s)</span>}
          <ChevronDown
            className="size-4 transition-transform group-open/filters:rotate-180"
            aria-hidden="true"
          />
        </span>
      </summary>
      <div className="border-t p-4 sm:p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-xl text-sm text-muted-foreground">
            Choisissez les budgets et les détails que vous souhaitez voir.
            Enregistrez ensuite cette vue pour la retrouver.
          </p>
          <Button variant="ghost" className="min-h-10" onClick={onReset}>
            <RotateCcw aria-hidden="true" />
            Réinitialiser cette vue
          </Button>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Quels horizons suivre ?
            </legend>
            {Object.entries(periodLabels).map(([id, label]) => (
              <label
                key={id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/40 has-checked:bg-primary/5"
              >
                <input
                  className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  type="checkbox"
                  checked={config.period_types.includes(id as PeriodType)}
                  disabled={
                    config.period_types.length === 1 &&
                    config.period_types.includes(id as PeriodType)
                  }
                  onChange={() =>
                    onChange({
                      ...config,
                      period_types: toggle(
                        config.period_types,
                        id,
                      ) as PeriodType[],
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">
              Quels détails afficher ?
            </legend>
            {[
              ['progress', 'Comparaison au budget'],
              ['trend', 'Évolution des dépenses'],
              ['upcoming', 'Échéances récurrentes'],
            ].map(([id, label]) => (
              <label
                key={id}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/40 has-checked:bg-primary/5"
              >
                <input
                  className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  type="checkbox"
                  checked={config.widgets.includes(
                    id as ViewConfig['widgets'][number],
                  )}
                  disabled={
                    config.widgets.length === 1 &&
                    config.widgets.includes(id as ViewConfig['widgets'][number])
                  }
                  onChange={() =>
                    onChange({
                      ...config,
                      widgets: toggle(
                        config.widgets,
                        id,
                      ) as ViewConfig['widgets'],
                    })
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Portefeuilles</legend>
            <p className="text-xs text-muted-foreground">
              Tous les portefeuilles sont inclus quand aucun n’est sélectionné.
            </p>
            <div className="max-h-40 space-y-2 overflow-auto">
              {wallets.map((wallet) => (
                <label
                  key={wallet.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/40 has-checked:bg-primary/5"
                >
                  <input
                    className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    type="checkbox"
                    checked={config.wallet_ids.includes(wallet.id)}
                    onChange={() =>
                      onChange({
                        ...config,
                        wallet_ids: toggle(config.wallet_ids, wallet.id),
                      })
                    }
                  />
                  {wallet.name}
                </label>
              ))}
            </div>
            {config.wallet_ids.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onChange({ ...config, wallet_ids: [] })}
              >
                Tous les portefeuilles
              </Button>
            )}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="view-category">Catégories à afficher</Label>
            <CategorySearch
              key={config.category_ids.join(',')}
              id="view-category"
              value=""
              onChange={(id) => {
                if (id && !config.category_ids.includes(id))
                  onChange({
                    ...config,
                    category_ids: [...config.category_ids, id],
                  })
              }}
              categories={categories}
              scope={{ rootOnly: true }}
              placeholder="Ajouter une catégorie…"
            />
            <div className="flex flex-wrap gap-1">
              {config.category_ids.map((id) => (
                <Button
                  key={id}
                  variant="secondary"
                  size="sm"
                  className="min-h-9"
                  aria-label={`Retirer le filtre ${categories.find((category) => category.id === id)?.name ?? 'catégorie indisponible'}`}
                  onClick={() =>
                    onChange({
                      ...config,
                      category_ids: config.category_ids.filter(
                        (item) => item !== id,
                      ),
                    })
                  }
                >
                  {categories.find((category) => category.id === id)?.name ??
                    'Catégorie indisponible'}{' '}
                  ×
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Toutes les catégories sont incluses quand aucune n’est
              sélectionnée.
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Budgets précis</legend>
            <p className="text-xs text-muted-foreground">
              Affinez cette vue sur quelques budgets, ou ne sélectionnez rien
              pour tous les afficher.
            </p>
            <div className="max-h-40 space-y-2 overflow-auto">
              {[
                ...new Map(
                  goals.map((goal) => [goal.series_id ?? goal.id, goal]),
                ).values(),
              ].map((goal) => (
                <label
                  key={goal.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-muted/40 has-checked:bg-primary/5"
                >
                  <input
                    className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    type="checkbox"
                    checked={config.budget_ids.includes(
                      goal.series_id ?? goal.id,
                    )}
                    onChange={() =>
                      onChange({
                        ...config,
                        budget_ids: toggle(
                          config.budget_ids,
                          goal.series_id ?? goal.id,
                        ),
                      })
                    }
                  />
                  {goal.name} · {periodLabels[goal.period_type]}
                </label>
              ))}
            </div>
            {config.budget_ids.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onChange({ ...config, budget_ids: [] })}
              >
                Tous les budgets
              </Button>
            )}
          </fieldset>
          <div className="space-y-2">
            <Label htmlFor="view-status">État des budgets</Label>
            <select
              id="view-status"
              className={select}
              value={config.status}
              onChange={(event) =>
                onChange({
                  ...config,
                  status: event.target.value as ViewConfig['status'],
                })
              }
            >
              <option value="all">Tous</option>
              <option value="active">En cours</option>
              <option value="upcoming">À venir</option>
              <option value="ended">Terminés</option>
            </select>
          </div>
        </div>
        <p className="pt-3 text-xs text-muted-foreground">
          Ces filtres sélectionnent les budgets affichés. Chaque budget conserve
          ses dates et l’ensemble de ses portefeuilles.
        </p>
      </div>
    </details>
  )
}
