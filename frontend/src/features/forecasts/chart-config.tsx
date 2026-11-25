import { ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import type { ChartConfig } from '@/components/ui/chart'
import { formatCents } from './format'

/** Series names and colors, exposed by ChartContainer as --color-<key>. */
export const forecastChartConfig = {
  balance: { label: 'Solde', color: 'var(--primary)' },
  income: { label: 'Rentrées', color: '#10b981' },
  expenses: { label: 'Dépenses', color: '#f43f5e' },
} satisfies ChartConfig

type SeriesKey = keyof typeof forecastChartConfig

/** shadcn tooltip with amounts in cents rendered as euros. */
export function MoneyTooltip({
  labelFormatter,
}: {
  labelFormatter: (label: string) => string
}) {
  return (
    <ChartTooltip
      content={
        <ChartTooltipContent
          labelFormatter={(label) => labelFormatter(String(label))}
          formatter={(value, name) => (
            <div className="flex w-full justify-between gap-4">
              <span className="text-muted-foreground">
                {forecastChartConfig[name as SeriesKey].label}
              </span>
              <span className="font-medium tabular-nums">
                {formatCents(Number(value))}
              </span>
            </div>
          )}
        />
      }
    />
  )
}
