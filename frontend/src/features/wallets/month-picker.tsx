import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  currentMonthPeriod,
  periodMonth,
  shiftPeriodMonth,
  validPeriod,
} from './period'
import type { WalletDateRange } from './period'

export const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString('fr-BE', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
  })

/** ‹ Month › navigation, with a custom date range as an escape hatch. */
export function MonthPicker({
  value,
  onChange,
}: {
  value: WalletDateRange
  onChange: (value: WalletDateRange) => void
}) {
  const month = periodMonth(value)
  const [custom, setCustom] = useState(!month)
  const current = currentMonthPeriod()
  const shift = (offset: number) => {
    const next = shiftPeriodMonth(value, offset)
    if (next) {
      setCustom(false)
      onChange(next)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1 rounded-md border bg-background">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Mois précédent"
          onClick={() => shift(-1)}
        >
          <ChevronLeft />
        </Button>
        <span
          className="min-w-36 text-center text-sm font-medium capitalize"
          aria-live="polite"
        >
          {month
            ? monthName(month)
            : `${value.date_from.split('-').reverse().join('/')} → ${value.date_to.split('-').reverse().join('/')}`}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Mois suivant"
          onClick={() => shift(1)}
        >
          <ChevronRight />
        </Button>
      </div>
      {(value.date_from !== current.date_from ||
        value.date_to !== current.date_to) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setCustom(false)
            onChange(current)
          }}
        >
          Ce mois-ci
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        aria-pressed={custom}
        onClick={() => setCustom((open) => !open)}
      >
        <CalendarDays aria-hidden="true" />
        Personnalisé
      </Button>
      {custom && (
        <div className="flex flex-wrap items-center gap-3">
          {(['date_from', 'date_to'] as const).map((key) => (
            <div key={key} className="flex items-center gap-1.5">
              <Label htmlFor={`period-${key}`} className="text-xs">
                {key === 'date_from' ? 'Du' : 'Au'}
              </Label>
              <Input
                className="h-8 w-auto"
                id={`period-${key}`}
                type="date"
                value={value[key]}
                aria-invalid={!validPeriod(value)}
                onChange={(event) =>
                  onChange({ ...value, [key]: event.target.value })
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
