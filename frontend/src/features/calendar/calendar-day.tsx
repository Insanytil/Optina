import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from 'cn'
import { signedCents } from '../forecasts/forecast-model'
import {
  amountTone,
  formatCents,
  formatDate,
  formatSignedCents,
} from '../forecasts/format'
import { summarizeDay } from './calendar-model'
import { WalletSwatch } from './wallet-filter'
import type {
  CalendarDay as Day,
  CalendarOccurrence,
  DaySummary,
} from './calendar-model'

/** Above this many occurrences a cell shows a count and the net instead. */
const MAX_PILLS = 2
const MAX_DOTS = 4

const occurrenceKey = (occurrence: CalendarOccurrence) =>
  `${occurrence.recurrence_id}:${occurrence.scheduled_date}`

const plural = (count: number) => `${count} échéance${count > 1 ? 's' : ''}`

type ColorOf = (occurrence: CalendarOccurrence) => string | undefined

function Pill({
  occurrence,
  colorOf,
}: {
  occurrence: CalendarOccurrence
  colorOf: ColorOf
}) {
  const amount = signedCents(occurrence)
  return (
    <span
      title={
        occurrence.wallet_name
          ? `${occurrence.label} · ${occurrence.wallet_name}`
          : occurrence.label
      }
      style={{ borderLeftColor: colorOf(occurrence) }}
      className={cn(
        'block truncate rounded border-l-[3px] border-transparent px-1 text-[11px] leading-4 tabular-nums',
        amount < 0 ? 'bg-rose-500/10' : 'bg-emerald-500/10',
        amountTone(amount),
      )}
    >
      {formatSignedCents(amount)}
    </span>
  )
}

/** Phone: a few colored dots, then "+N". */
function Dots({ occurrences }: { occurrences: CalendarOccurrence[] }) {
  const extra = occurrences.length - MAX_DOTS
  return (
    <span className="mt-1 flex items-center gap-0.5 sm:hidden">
      {occurrences.slice(0, MAX_DOTS).map((occurrence) => (
        <span
          key={occurrenceKey(occurrence)}
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            occurrence.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500',
          )}
        />
      ))}
      {extra > 0 && (
        <span className="text-[9px] leading-none text-muted-foreground">
          +{extra}
        </span>
      )}
    </span>
  )
}

/** Desktop: the amounts when few, otherwise the count and the day's net. */
function Amounts({
  occurrences,
  net,
  colorOf,
}: {
  occurrences: CalendarOccurrence[]
  net: number
  colorOf: ColorOf
}) {
  if (occurrences.length > MAX_PILLS)
    return (
      <span className="mt-1 hidden text-[11px] leading-4 sm:block">
        <span className="block text-muted-foreground">
          {plural(occurrences.length)}
        </span>
        <span className={cn('block tabular-nums', amountTone(net))}>
          {formatSignedCents(net)}
        </span>
      </span>
    )
  return (
    <span className="mt-1 hidden space-y-0.5 sm:block">
      {occurrences.map((occurrence) => (
        <Pill
          key={occurrenceKey(occurrence)}
          occurrence={occurrence}
          colorOf={colorOf}
        />
      ))}
    </span>
  )
}

function Group({
  title,
  items,
  total,
  sign,
  showHeader,
  colorOf,
}: {
  title: string
  items: CalendarOccurrence[]
  total: number
  sign: 1 | -1
  showHeader: boolean
  colorOf: ColorOf
}) {
  if (items.length === 0) return null
  return (
    <section className="space-y-1">
      {showHeader && (
        <h4 className="flex justify-between rounded-md bg-muted px-2 py-1 text-sm font-semibold">
          <span>{title}</span>
          {/* A subtotal of one item would just repeat its amount. */}
          {items.length > 1 && (
            <span className={cn('tabular-nums', amountTone(sign * total))}>
              {formatSignedCents(sign * total)}
            </span>
          )}
        </h4>
      )}
      <ul className={cn('space-y-1.5', showHeader && 'px-2')}>
        {items.map((occurrence) => {
          const amount = signedCents(occurrence)
          return (
            <li
              key={occurrenceKey(occurrence)}
              className="flex justify-between gap-4"
            >
              <span className="min-w-0">
                <span className="block truncate">{occurrence.label}</span>
                {occurrence.wallet_name && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <WalletSwatch
                      color={colorOf(occurrence) ?? 'currentColor'}
                    />
                    <span className="truncate">{occurrence.wallet_name}</span>
                  </span>
                )}
              </span>
              <span className={cn('shrink-0 tabular-nums', amountTone(amount))}>
                {formatSignedCents(amount)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function DayDetails({
  date,
  summary,
  colorOf,
}: {
  date: string
  summary: DaySummary
  colorOf: ColorOf
}) {
  const count = summary.incomes.length + summary.expenses.length
  // Group titles only help when a group holds several items; otherwise the
  // amounts speak for themselves.
  const grouped = summary.incomes.length > 1 || summary.expenses.length > 1
  return (
    <div className="flex max-h-80 flex-col gap-2 text-sm">
      <p className="flex justify-between font-medium">
        <span>{formatDate(date)}</span>
        <span className="text-muted-foreground">{plural(count)}</span>
      </p>
      <div className="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
        <Group
          title="Rentrées"
          items={summary.incomes}
          total={summary.income}
          sign={1}
          showHeader={grouped}
          colorOf={colorOf}
        />
        <Group
          title="Dépenses"
          items={summary.expenses}
          total={summary.expense}
          sign={-1}
          showHeader={grouped}
          colorOf={colorOf}
        />
      </div>
      {/* Net only adds information when both groups are present. */}
      {summary.incomes.length > 0 && summary.expenses.length > 0 && (
        <p className="flex justify-between gap-4 border-t pt-2 font-medium">
          <span>Net du jour</span>
          <span className={cn('tabular-nums', amountTone(summary.net))}>
            {formatSignedCents(summary.net)}
          </span>
        </p>
      )}
    </div>
  )
}

const cellClass = (day: Day) =>
  cn(
    'flex h-full min-h-16 w-full flex-col overflow-hidden rounded-md border p-1 text-left',
    !day.inMonth && 'opacity-40',
    day.isPast && 'bg-muted/40',
  )

function DayNumber({ day, isToday }: { day: Day; isToday: boolean }) {
  return (
    <span
      className={cn(
        'flex size-5 items-center justify-center rounded-full text-xs',
        isToday && 'bg-primary font-semibold text-primary-foreground',
      )}
    >
      {Number(day.date.slice(8))}
    </span>
  )
}

export function CalendarDay({
  day,
  today,
  colors,
}: {
  day: Day
  today: string
  colors: Map<string, string>
}) {
  const colorOf: ColorOf = (occurrence) =>
    occurrence.wallet_id ? colors.get(occurrence.wallet_id) : undefined
  const number = <DayNumber day={day} isToday={day.date === today} />
  if (day.occurrences.length === 0)
    return <div className={cellClass(day)}>{number}</div>

  const summary = summarizeDay(day.occurrences)
  const ordered = [...summary.incomes, ...summary.expenses]
  return (
    <Popover>
      <PopoverTrigger
        className={cn(cellClass(day), 'cursor-pointer hover:bg-muted')}
        aria-label={`${formatDate(day.date)} : ${plural(ordered.length)}, net ${formatCents(summary.net)}`}
      >
        {number}
        <Dots occurrences={ordered} />
        <Amounts occurrences={ordered} net={summary.net} colorOf={colorOf} />
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <DayDetails date={day.date} summary={summary} colorOf={colorOf} />
      </PopoverContent>
    </Popover>
  )
}
