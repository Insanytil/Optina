import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ResponsiveChart } from '@/components/ui/responsive-chart'
import { formatBalance } from './api'
import { lastReal } from './wallet-model'
import type { CurvePoint } from './wallet-model'

const axis = { fontSize: 11, fill: 'var(--muted-foreground)' }
const shortDate = (value: string) =>
  value.slice(5).split('-').reverse().join('/')
const money = (value: number) => formatBalance(value.toFixed(2))

/** Daily balance: solid while real, dashed once projected. */
export function BalanceChart({
  points,
  className,
  color,
}: {
  points: CurvePoint[]
  color: string
  className?: string
}) {
  const today = lastReal(points)?.date
  return (
    <div
      className={className ?? 'h-64'}
      role="img"
      aria-label="Solde jour par jour : réel jusqu'à aujourd'hui, puis prévu avec les récurrences."
    >
      <ResponsiveChart>
        <ComposedChart
          data={points}
          margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          accessibilityLayer
        >
          <defs>
            <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={axis}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(value: number) =>
              Math.abs(value) >= 1000
                ? `${(value / 1000).toFixed(1)} k`
                : String(value)
            }
          />
          <ReferenceLine
            y={0}
            stroke="var(--destructive)"
            strokeDasharray="3 3"
          />
          {today && today !== points.at(-1)?.date && (
            <ReferenceLine
              x={today}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 4"
            />
          )}
          <Tooltip
            content={({ active, payload }) => {
              const point = payload.at(0)?.payload as CurvePoint | undefined
              if (!active || !point) return null
              const value = point.real ?? point.projected
              return (
                <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="font-medium">{shortDate(point.date)}</p>
                  <p className="tabular-nums">
                    {value === null ? '—' : money(value)}
                    {point.real === null && (
                      <span className="text-muted-foreground"> · prévu</span>
                    )}
                  </p>
                </div>
              )
            }}
          />
          <Area
            type="stepAfter"
            dataKey="real"
            stroke={color}
            strokeWidth={2}
            fill="url(#balance-fill)"
            connectNulls={false}
            isAnimationActive={false}
          />
          <Line
            type="stepAfter"
            dataKey="projected"
            stroke={color}
            strokeWidth={2}
            strokeDasharray="5 4"
            strokeOpacity={0.75}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveChart>
    </div>
  )
}
