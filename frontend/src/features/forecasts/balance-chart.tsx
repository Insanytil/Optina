import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { forecastChartConfig, MoneyTooltip } from './chart-config'
import type { BalancePoint, DatedAmount } from './forecast-model'
import {
  formatAxisCents,
  formatCents,
  formatDate,
  formatShortMonth,
} from './format'

const monthTick = (date: string) =>
  date.endsWith('-01') ? formatShortMonth(date.slice(0, 7)) : ''

export function BalanceChart({
  points,
  minimum,
}: {
  points: BalancePoint[]
  minimum: DatedAmount
}) {
  return (
    <ChartContainer
      config={forecastChartConfig}
      className="aspect-auto h-56 w-full"
      aria-label={`Solde projeté jour par jour. Point bas : ${formatCents(minimum.amount)} le ${formatDate(minimum.date)}.`}
      role="img"
    >
      <AreaChart data={points} margin={{ top: 8, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={monthTick}
          interval={0}
          tickLine={false}
        />
        <YAxis
          width={48}
          tickFormatter={formatAxisCents}
          tickLine={false}
          axisLine={false}
        />
        <MoneyTooltip labelFormatter={formatDate} />
        <ReferenceLine
          y={0}
          stroke="var(--color-expenses)"
          strokeDasharray="4 4"
        />
        <Area
          type="stepAfter"
          dataKey="balance"
          stroke="var(--color-balance)"
          fill="var(--color-balance)"
          fillOpacity={0.12}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <ReferenceDot
          x={minimum.date}
          y={minimum.amount}
          r={5}
          fill="var(--background)"
          stroke="var(--color-expenses)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  )
}
