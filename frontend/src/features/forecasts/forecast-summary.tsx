import type { ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card } from '@/components/ui/card'
import type { ForecastSummary as Summary } from './forecast-model'
import {
  amountTone,
  formatCents,
  formatDate,
  formatSignedCents,
} from './format'

function Stat({
  label,
  value,
  detail,
  tone = '',
}: {
  label: string
  value: string
  detail: ReactNode
  tone?: string
}) {
  return (
    <div className="min-w-0 bg-card px-4 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

export function ForecastSummary({ summary }: { summary: Summary }) {
  const { current, final, change, net, minimum, occurrenceCount } = summary
  return (
    <Card className="grid grid-cols-2 gap-px bg-border py-0 lg:grid-cols-4">
      <Stat
        label="Solde actuel"
        value={formatCents(current)}
        detail="aujourd’hui"
      />
      <Stat
        label="Solde fin de période"
        value={formatCents(final)}
        detail={
          <span className={amountTone(change)}>
            {formatSignedCents(change)} vs aujourd’hui
          </span>
        }
      />
      <Stat
        label="Point bas"
        value={formatCents(minimum.amount)}
        detail={`le ${formatDate(minimum.date)}`}
        tone={minimum.amount < 0 ? 'text-rose-500' : ''}
      />
      <Stat
        label="Net de la période"
        value={formatSignedCents(net)}
        detail={`${occurrenceCount} échéances`}
        tone={amountTone(net)}
      />
    </Card>
  )
}

export function ShortfallAlert({ minimum }: { minimum: Summary['minimum'] }) {
  if (minimum.amount >= 0) return null
  return (
    <Alert className="border-amber-500/30 bg-amber-500/10">
      <TriangleAlert className="text-amber-600" aria-hidden="true" />
      <AlertTitle>
        Il manquera {formatCents(-minimum.amount)} le {formatDate(minimum.date)}
      </AlertTitle>
      <AlertDescription>
        Si rien ne change. Prévoyez un virement avant cette date.
      </AlertDescription>
    </Alert>
  )
}
