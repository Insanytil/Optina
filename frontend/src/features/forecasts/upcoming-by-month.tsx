import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { cn } from 'cn'
import type { ForecastMonth, ForecastOccurrence } from './forecast-model'
import { signedCents } from './forecast-model'
import {
  amountTone,
  formatDate,
  formatDay,
  formatMonth,
  formatSignedCents,
} from './format'

export const occurrenceKey = (occurrence: ForecastOccurrence) =>
  `${occurrence.recurrence_id}:${occurrence.scheduled_date}`

interface SelectionProps {
  selected: ForecastOccurrence | null
  onSelect: (occurrence: ForecastOccurrence | null) => void
}

function OccurrenceRow({
  occurrence,
  selected,
  onSelect,
}: { occurrence: ForecastOccurrence } & SelectionProps) {
  const amount = signedCents(occurrence)
  const late = occurrence.date !== occurrence.scheduled_date
  const isSelected =
    selected !== null && occurrenceKey(selected) === occurrenceKey(occurrence)
  return (
    <li className="border-t first:border-t-0">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={() => onSelect(isSelected ? null : occurrence)}
        className={cn(
          'flex w-full cursor-pointer justify-between gap-3 rounded-md px-1 py-1.5 text-left hover:bg-muted',
          isSelected && 'bg-primary/10 ring-1 ring-primary hover:bg-primary/10',
        )}
      >
        {/* Day in its own column so long labels wrap under the label. */}
        <span className="flex min-w-0 gap-2">
          <span className="w-5 shrink-0 tabular-nums text-muted-foreground">
            {formatDay(occurrence.date)}
          </span>
          <span className="min-w-0">
            {occurrence.label}
            {late && (
              <span className="block text-xs text-muted-foreground">
                En retard, prévue le {formatDate(occurrence.scheduled_date)}
              </span>
            )}
          </span>
        </span>
        <span className={`shrink-0 tabular-nums ${amountTone(amount)}`}>
          {formatSignedCents(amount)}
        </span>
      </button>
    </li>
  )
}

/** Months only; open one to see its occurrences. Totals live in the table. */
export function UpcomingByMonth({
  months,
  selected,
  onSelect,
}: { months: ForecastMonth[] } & SelectionProps) {
  const withOccurrences = months.filter((month) => month.occurrences.length > 0)
  return (
    <Accordion
      multiple
      defaultValue={withOccurrences.slice(0, 1).map((m) => m.month)}
    >
      {withOccurrences.map((month) => (
        <AccordionItem key={month.month} value={month.month}>
          <AccordionTrigger className="capitalize">
            <span className="flex flex-1 items-center gap-2">
              {formatMonth(month.month)}
              <Badge variant="secondary">{month.occurrences.length}</Badge>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ul>
              {month.occurrences.map((occurrence) => (
                <OccurrenceRow
                  key={occurrenceKey(occurrence)}
                  occurrence={occurrence}
                  selected={selected}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
