import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatMonth } from '../forecasts/format'
import { CalendarDay } from './calendar-day'
import { WEEKDAYS } from './calendar-model'
import { useUpcomingCalendar } from './use-upcoming-calendar'
import { WalletFilter } from './wallet-filter'

/** Home calendar: what goes out and comes in, across every wallet. */
export function UpcomingCalendar() {
  const calendar = useUpcomingCalendar()
  const { query, month, weeks, today } = calendar

  return (
    <Card size="sm" className="lg:min-h-0 lg:flex-1">
      <CardHeader>
        <CardTitle>Échéances à venir</CardTitle>
        <CardDescription>
          Rentrées et dépenses récurrentes de tous vos portefeuilles
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mois précédent"
            disabled={!calendar.canGoBack}
            onClick={calendar.previous}
          >
            <ChevronLeft />
          </Button>
          <span
            className="min-w-32 text-center text-sm font-medium capitalize"
            aria-live="polite"
          >
            {formatMonth(month)}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mois suivant"
            onClick={calendar.next}
          >
            <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2">
        <WalletFilter
          legend={calendar.legend}
          onToggle={calendar.toggle}
          onShowAll={calendar.showAll}
          onHideAll={calendar.hideAll}
        />
        {query.isError ? (
          <Alert variant="destructive">
            <AlertDescription>{query.error.message}</AlertDescription>
            <AlertAction>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void query.refetch()}
              >
                Réessayer
              </Button>
            </AlertAction>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] uppercase text-muted-foreground">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday}>{weekday}</span>
              ))}
            </div>
            <div
              className="grid flex-1 auto-rows-fr grid-cols-7 gap-1"
              aria-busy={query.isPending}
            >
              {weeks
                .flat()
                .map((day) =>
                  query.isPending ? (
                    <Skeleton key={day.date} className="min-h-16" />
                  ) : (
                    <CalendarDay
                      key={day.date}
                      day={day}
                      today={today}
                      colors={calendar.colors}
                    />
                  ),
                )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
