import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { periodPresets, presetPeriod, validPeriod } from './period'
import type { WalletDateRange } from './period'

export function PeriodPicker({
  value,
  onChange,
}: {
  value: WalletDateRange
  onChange: (value: WalletDateRange) => void
}) {
  const [custom, setCustom] = useState(false)
  const selected = periodPresets.find(({ id }) => {
    const period = presetPeriod(id)
    return (
      period.date_from === value.date_from && period.date_to === value.date_to
    )
  })?.id
  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-center gap-1.5"
        aria-label="Choisir une période"
      >
        {periodPresets.map(({ id, label }) => (
          <Button
            key={id}
            size="sm"
            variant="outline"
            aria-pressed={!custom && selected === id}
            className={
              !custom && selected === id
                ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground'
            }
            onClick={() => {
              setCustom(false)
              onChange(presetPeriod(id))
            }}
          >
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          aria-pressed={custom || !selected}
          onClick={() => setCustom(true)}
        >
          <CalendarDays aria-hidden="true" />
          Personnalisé
        </Button>
      </div>
      {(custom || !selected) && (
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label htmlFor="period-from">Du</Label>
            <Input
              id="period-from"
              type="date"
              className="h-9"
              value={value.date_from}
              onChange={(event) =>
                onChange({ ...value, date_from: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="period-to">Au</Label>
            <Input
              id="period-to"
              type="date"
              className="h-9"
              value={value.date_to}
              onChange={(event) =>
                onChange({ ...value, date_to: event.target.value })
              }
            />
          </div>
        </div>
      )}
      {!validPeriod(value) && (
        <p role="alert" className="text-sm text-destructive">
          Choisissez deux dates valides, dans l’ordre chronologique.
        </p>
      )}
    </div>
  )
}
