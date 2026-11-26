import { Link } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import { Alert, AlertAction, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { BalanceChart } from './balance-chart'
import { ForecastSummary, ShortfallAlert } from './forecast-summary'
import type { ForecastHorizon } from './forecast-model'
import { MonthlyChart } from './monthly-chart'
import { MonthlyTable } from './monthly-table'
import { UpcomingByMonth } from './upcoming-by-month'
import { useForecast } from './use-forecast'

function ForecastSkeleton() {
  return (
    <div
      role="status"
      aria-label="Calcul des échéances"
      className="space-y-2.5"
    >
      <Skeleton className="h-[74px] rounded-xl" />
      <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[392px] rounded-xl" />
        <Skeleton className="h-[392px] rounded-xl" />
      </div>
    </div>
  )
}

function NoOccurrences({ walletId }: { walletId: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarClock />
        </EmptyMedia>
        <EmptyTitle>Aucune échéance sur cette période</EmptyTitle>
        <EmptyDescription>
          Ajoutez une récurrence pour voir l’évolution de votre solde.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link to="/recurrences" search={{ walletId }} />}
        >
          Créer une récurrence
        </Button>
      </EmptyContent>
    </Empty>
  )
}

export function ForecastView({
  walletId,
  months,
}: {
  walletId: string
  months: ForecastHorizon
}) {
  const { view, isPending, isError, error, refetch } = useForecast(
    walletId,
    months,
  )

  if (isPending) return <ForecastSkeleton />
  if (isError || !view)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {error?.message ?? 'Les prévisions sont indisponibles.'}
        </AlertDescription>
        <AlertAction>
          <Button size="sm" variant="outline" onClick={() => void refetch()}>
            Réessayer
          </Button>
        </AlertAction>
      </Alert>
    )

  const { summary, balance, movements, months: monthViews } = view
  return (
    <div className="space-y-2.5">
      <ForecastSummary summary={summary} />
      <ShortfallAlert minimum={summary.minimum} />
      {summary.occurrenceCount === 0 ? (
        <NoOccurrences walletId={walletId} />
      ) : (
        <>
          <div className="grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_300px]">
            <Card size="sm" className="lg:h-[392px]">
              <CardHeader>
                <CardTitle>Solde projeté</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <BalanceChart
                  points={balance}
                  movements={movements}
                  minimum={summary.minimum}
                />
                <CardTitle>Rentrées et dépenses par mois</CardTitle>
                <MonthlyChart months={monthViews} />
              </CardContent>
            </Card>
            <Card size="sm" className="lg:h-[392px]">
              <CardHeader>
                <CardTitle>Prochaines échéances</CardTitle>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-y-auto">
                <UpcomingByMonth months={monthViews} />
              </CardContent>
            </Card>
          </div>
          <MonthlyTable months={monthViews} />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Calculé à partir du solde actuel et des récurrences actives uniquement :
        les dépenses ponctuelles et imprévus ne sont pas inclus. Le point bas
        correspond au solde en fin de journée.
      </p>
    </div>
  )
}
