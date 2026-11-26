import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { cn } from 'cn'
import { forecastChartConfig } from './chart-config'
import { signedCents } from './forecast-model'
import type {
  BalancePoint,
  DatedAmount,
  ForecastOccurrence,
} from './forecast-model'
import {
  amountTone,
  formatAxisCents,
  formatCents,
  formatDate,
  formatShortMonth,
  formatSignedCents,
} from './format'

type Movements = Map<string, ForecastOccurrence[]>

const monthTick = (date: string) =>
  date.endsWith('-01') ? formatShortMonth(date.slice(0, 7)) : ''

interface DotProps {
  cx?: number
  cy?: number
  payload?: BalancePoint
}

/** A dot on each day the balance moves, colored by the day's net. */
function movementDot(movements: Movements) {
  return function MovementDot({ cx, cy, payload }: DotProps) {
    const items = payload && movements.get(payload.date)
    if (!items || cx === undefined || cy === undefined)
      return <g key={`${cx}-${cy}`} />
    const net = items.reduce((total, item) => total + signedCents(item), 0)
    return (
      <circle
        key={payload.date}
        cx={cx}
        cy={cy}
        r={3}
        fill={net < 0 ? 'var(--color-expenses)' : 'var(--color-income)'}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    )
  }
}

function BalanceTooltip({
  active,
  payload,
  movements,
}: {
  active?: boolean
  payload?: { payload: BalancePoint }[]
  movements: Movements
}) {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const items = movements.get(point.date) ?? []
  return (
    <div className="grid min-w-48 max-w-64 gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{formatDate(point.date)}</p>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => {
            const amount = signedCents(item)
            return (
              <li
                key={item.recurrence_id}
                className="flex justify-between gap-4"
              >
                <span className="truncate">{item.label}</span>
                <span
                  className={cn('shrink-0 tabular-nums', amountTone(amount))}
                >
                  {formatSignedCents(amount)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="flex justify-between gap-4 border-t pt-1.5">
        <span className="text-muted-foreground">Solde</span>
        <span
          className={cn('font-medium tabular-nums', amountTone(point.balance))}
        >
          {formatCents(point.balance)}
        </span>
      </p>
    </div>
  )
}

export function BalanceChart({
  points,
  movements,
  minimum,
}: {
  points: BalancePoint[]
  movements: Movements
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
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          content={<BalanceTooltip movements={movements} />}
        />
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
          dot={movementDot(movements)}
          activeDot={{ r: 4, stroke: 'var(--background)', strokeWidth: 2 }}
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
