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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatMonth } from '../forecasts/format'
import { CalendarDay } from './calendar-day'
import { WEEKDAYS } from './calendar-model'
import { useUpcomingCalendar } from './use-upcoming-calendar'

const ALL = 'all'

function WalletFilter({
  wallets,
  walletId,
  onChange,
}: {
  wallets: { id: string; name: string }[]
  walletId?: string
  onChange: (walletId?: string) => void
}) {
  if (wallets.length < 2) return null
  return (
    <ToggleGroup
      aria-label="Portefeuille"
      variant="outline"
      size="sm"
      className="flex-wrap"
      value={[walletId ?? ALL]}
      onValueChange={(values) => {
        const value = values[0]
        if (value) onChange(value === ALL ? undefined : value)
      }}
    >
      <ToggleGroupItem value={ALL}>Tous</ToggleGroupItem>
      {wallets.map((wallet) => (
        <ToggleGroupItem key={wallet.id} value={wallet.id}>
          {wallet.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

/** Home calendar: what goes out and comes in, across every wallet. */
export function UpcomingCalendar() {
  const calendar = useUpcomingCalendar()
  const { query, month, weeks, today } = calendar

  return (
    <Card size="sm">
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
      <CardContent className="space-y-2">
        <WalletFilter
          wallets={calendar.wallets}
          walletId={calendar.walletId}
          onChange={calendar.setWalletId}
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
            <div className="grid grid-cols-7 gap-1" aria-busy={query.isPending}>
              {weeks
                .flat()
                .map((day) =>
                  query.isPending ? (
                    <Skeleton key={day.date} className="min-h-16" />
                  ) : (
                    <CalendarDay key={day.date} day={day} today={today} />
                  ),
                )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
