import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from 'cn'
import {
  periodMonth,
  presetPeriod,
  shiftPeriodMonth,
  validPeriod,
} from './period'
import type { WalletDateRange } from './period'

export const monthName = (month: string, style: 'long' | 'short' = 'long') =>
  new Date(`${month}-15T12:00:00`).toLocaleDateString('fr-BE', {
    month: style,
    year: style === 'long' ? 'numeric' : undefined,
  })

const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('fr-BE', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })

const PRESETS = [
  { id: 'month', label: 'Ce mois-ci' },
  { id: 'last', label: 'Mois dernier' },
  { id: '3m', label: '3 derniers mois' },
  { id: 'year', label: 'Cette année' },
] as const

const presetRange = (id: string) =>
  id === 'last'
    ? shiftPeriodMonth(presetPeriod('month'), -1)!
    : presetPeriod(id)

/** Name of a period: the month, or both ends of a custom range. */
export function periodLabel(value: WalletDateRange) {
  const month = periodMonth(value)
  return month
    ? monthName(month)
    : `${shortDay(value.date_from)} → ${shortDay(value.date_to)}`
}

/** ‹ Month › pill; the middle opens presets and a custom range. */
export function MonthPicker({
  value,
  onChange,
  className,
}: {
  value: WalletDateRange
  onChange: (value: WalletDateRange) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const shift = (offset: number) => {
    const next = shiftPeriodMonth(value, offset)
    if (next) onChange(next)
  }
  const same = (range: WalletDateRange) =>
    range.date_from === value.date_from && range.date_to === value.date_to
  return (
    <div
      className={cn(
        'flex h-9 min-w-0 items-center rounded-full border bg-background',
        className,
      )}
    >
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label="Période précédente"
        onClick={() => shift(-1)}
      >
        <ChevronLeft />
      </Button>
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setDraft(value)
          setOpen(next)
        }}
      >
        <PopoverTrigger
          className="flex min-w-0 flex-1 items-center justify-center gap-1 truncate rounded-full px-2 text-sm font-medium capitalize hover:bg-muted focus-visible:outline-2"
          aria-label={`Période : ${periodLabel(value)}. Changer`}
        >
          <span className="truncate" aria-live="polite">
            {periodLabel(value)}
          </span>
          <ChevronDown
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </PopoverTrigger>
        <PopoverContent className="w-64 gap-3 p-2">
          <ul className="grid gap-0.5">
            {PRESETS.map((preset) => {
              const range = presetRange(preset.id)
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    className={cn(
                      'w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
                      same(range) && 'bg-muted font-medium',
                    )}
                    aria-current={same(range) || undefined}
                    onClick={() => {
                      onChange(range)
                      setOpen(false)
                    }}
                  >
                    {preset.label}
                  </button>
                </li>
              )
            })}
          </ul>
          <form
            className="grid gap-2 border-t px-2 pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              if (!validPeriod(draft)) return
              onChange(draft)
              setOpen(false)
            }}
          >
            <p className="text-xs font-medium text-muted-foreground">
              Plage personnalisée
            </p>
            {(['date_from', 'date_to'] as const).map((key) => (
              <div key={key} className="grid grid-cols-[2rem_1fr] items-center">
                <Label htmlFor={`period-${key}`} className="text-xs">
                  {key === 'date_from' ? 'Du' : 'Au'}
                </Label>
                <Input
                  id={`period-${key}`}
                  type="date"
                  className="h-8"
                  value={draft[key]}
                  aria-invalid={!validPeriod(draft)}
                  onChange={(event) =>
                    setDraft({ ...draft, [key]: event.target.value })
                  }
                />
              </div>
            ))}
            <Button type="submit" size="sm" disabled={!validPeriod(draft)}>
              Appliquer
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label="Période suivante"
        onClick={() => shift(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  )
}
