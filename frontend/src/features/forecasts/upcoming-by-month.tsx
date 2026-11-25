import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import type { ForecastMonth, ForecastOccurrence } from './forecast-model'
import { signedCents } from './forecast-model'
import {
  amountTone,
  formatDate,
  formatDay,
  formatMonth,
  formatSignedCents,
} from './format'

function OccurrenceRow({ occurrence }: { occurrence: ForecastOccurrence }) {
  const amount = signedCents(occurrence)
  const late = occurrence.date !== occurrence.scheduled_date
  return (
    <li className="flex justify-between gap-3 border-t py-1.5 first:border-t-0">
      <span className="min-w-0">
        <span className="mr-2 inline-block w-5 tabular-nums text-muted-foreground">
          {formatDay(occurrence.date)}
        </span>
        {occurrence.label}
        {late && (
          <span className="block pl-7 text-xs text-muted-foreground">
            En retard, prévue le {formatDate(occurrence.scheduled_date)}
          </span>
        )}
      </span>
      <span className={`shrink-0 tabular-nums ${amountTone(amount)}`}>
        {formatSignedCents(amount)}
      </span>
    </li>
  )
}

/** Months only; open one to see its occurrences. Totals live in the table. */
export function UpcomingByMonth({ months }: { months: ForecastMonth[] }) {
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
                  key={`${occurrence.recurrence_id}:${occurrence.scheduled_date}`}
                  occurrence={occurrence}
                />
              ))}
            </ul>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
