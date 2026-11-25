import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { forecastChartConfig, MoneyTooltip } from './chart-config'
import type { ForecastMonth } from './forecast-model'
import { formatAxisCents, formatMonth, formatShortMonth } from './format'

export function MonthlyChart({ months }: { months: ForecastMonth[] }) {
  return (
    <ChartContainer
      config={forecastChartConfig}
      className="aspect-auto h-32 w-full"
      aria-label="Rentrées et dépenses récurrentes par mois. Détail dans le tableau."
      role="img"
    >
      <BarChart data={months} margin={{ top: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={formatShortMonth}
          tickLine={false}
        />
        <YAxis
          width={48}
          tickFormatter={formatAxisCents}
          tickLine={false}
          axisLine={false}
        />
        <MoneyTooltip labelFormatter={formatMonth} />
        <Bar dataKey="income" fill="var(--color-income)" radius={3} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={3} />
      </BarChart>
    </ChartContainer>
  )
}
