import { cn } from 'cn'
import type { Level } from './budget-model'

export const levelText: Record<Level, string> = {
  ok: 'text-emerald-600 dark:text-emerald-400',
  watch: 'text-amber-600 dark:text-amber-400',
  over: 'text-rose-600 dark:text-rose-400',
}
const levelFill: Record<Level, string> = {
  ok: 'bg-emerald-500',
  watch: 'bg-amber-500',
  over: 'bg-rose-500',
}

/**
 * Spent (solid) then still planned (light) against the available amount.
 * When over budget the bar is scaled so the whole committed amount fits.
 */
export function BudgetBar({
  spent,
  upcoming,
  available,
  level,
  className,
}: {
  spent: number
  upcoming: number
  available: number
  level: Level
  className?: string
}) {
  const scale = Math.max(available, spent + upcoming, 0.01)
  const width = (value: number) => `${Math.max(0, (value / scale) * 100)}%`
  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative flex h-2 overflow-hidden rounded-full bg-muted',
        className,
      )}
    >
      <span
        className={cn('h-full', levelFill[level])}
        style={{ width: width(spent) }}
      />
      <span
        className={cn('h-full opacity-35', levelFill[level])}
        style={{ width: width(upcoming) }}
      />
      {spent + upcoming > available && available > 0 && (
        // Where the budget ends, inside an overspent bar.
        <span
          className="absolute inset-y-0 w-0.5 bg-background"
          style={{ left: width(available) }}
        />
      )}
    </div>
  )
}
