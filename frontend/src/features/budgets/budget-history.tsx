import { useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { Button } from '@/components/ui/button'
import { formatBalance } from '@/features/wallets/api'
import { budgetKeys, loadBudgetHistory, type BudgetDefinition } from './api'
import { budgetProgress } from './budget-progress'
import { formatDay } from './presentation'
export function BudgetHistory({
  budget,
  onClose,
}: {
  budget: BudgetDefinition
  onClose: () => void
}) {
  const query = useQuery({
    queryKey: [...budgetKeys.all, 'history', budget.id],
    queryFn: ({ signal }) => loadBudgetHistory(budget.id, signal),
  })
  const points =
    query.data?.items.map((item) => ({
      ...item,
      label: formatDay(item.date_from),
      actual: Number(item.spent),
      target: Number(item.amount),
    })) ?? []
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Évolution · {budget.name}</DialogTitle>
          <DialogDescription>
            Les 12 dernières périodes jusqu’à celle sélectionnée. Chaque période
            conserve son propre montant de référence. Les récurrences non
            enregistrées ne sont pas incluses dans cette comparaison.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status">Chargement de l’historique…</p>
        ) : query.isError ? (
          <div role="alert">
            <p>{query.error.message}</p>
            <Button variant="outline" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Situation au {formatDay(query.data!.as_of)}. Une période en cours
              ou future est incomplète : son réalisé ne représente pas son
              résultat final.
            </p>
            <div className="h-64 min-w-0" aria-hidden="true">
              <ResponsiveChart>
                <BarChart data={points}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis width={55} tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, label }) => {
                      const point = points.find((item) => item.label === label)
                      return active && point ? (
                        <div className="rounded-lg border bg-popover p-3 text-xs text-popover-foreground">
                          <p>{label}</p>
                          <p>Dépensé : {formatBalance(point.spent)}</p>
                          <p>Budget : {formatBalance(point.amount)}</p>
                        </div>
                      ) : null
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="actual"
                    name="Dépenses enregistrées"
                    fill="var(--primary)"
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="target"
                    name="Budget fixé"
                    fill="var(--muted-foreground)"
                    radius={[3, 3, 0, 0]}
                    fillOpacity={0.35}
                  />
                </BarChart>
              </ResponsiveChart>
            </div>
            <div className="overflow-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Historique des dépenses par période de {budget.name}
                </caption>
                <thead className="bg-muted/40">
                  <tr>
                    {[
                      'Période',
                      'Budget',
                      'Dépensé',
                      'Écart au budget',
                      'Utilisé',
                    ].map((label) => (
                      <th
                        key={label}
                        scope="col"
                        className="whitespace-nowrap p-3 font-medium"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {points.map((item) => {
                    const percent = budgetProgress(
                      item.amount,
                      item.spent,
                      item.spent,
                    ).percent
                    const end = item.date_to < query.data!.as_of
                    return (
                      <tr key={item.id}>
                        <th scope="row" className="min-w-48 p-3 font-normal">
                          <span className="block">
                            {formatDay(item.date_from)} —{' '}
                            {formatDay(item.date_to)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {end
                              ? 'Terminé'
                              : item.date_from > query.data!.as_of
                                ? 'À venir · réalisé incomplet'
                                : 'En cours · réalisé incomplet'}
                            {item.is_override ? ' · Période personnalisée' : ''}
                          </span>
                        </th>
                        <td className="whitespace-nowrap p-3 tabular-nums">
                          {formatBalance(item.amount)}
                        </td>
                        <td className="whitespace-nowrap p-3 tabular-nums">
                          {formatBalance(item.spent)}
                        </td>
                        <td className="whitespace-nowrap p-3">
                          {percent > 100 ? 'Dépassé' : 'Disponible'} :{' '}
                          {formatBalance(exactMargin(item.amount, item.spent))}
                        </td>
                        <td className="p-3 tabular-nums">
                          {percent.toLocaleString('fr-BE')} %
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
function exactMargin(amount: string, spent: string) {
  const cents = (value: string) => {
    const [a, b = ''] = value.split('.')
    return BigInt(a) * 100n + BigInt(b.padEnd(2, '0'))
  }
  const raw = cents(amount) - cents(spent),
    value = raw < 0n ? -raw : raw
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
}
