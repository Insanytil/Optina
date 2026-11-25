import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ForecastMonth } from './forecast-model'
import {
  amountTone,
  formatCents,
  formatDate,
  formatMonth,
  formatSignedCents,
} from './format'

const amountHeaders = ['Rentrées', 'Dépenses', 'Net', 'Point bas', 'Solde fin']
const stickyFirst = 'sticky left-0 bg-card'

export function MonthlyTable({ months }: { months: ForecastMonth[] }) {
  return (
    <Card className="py-0">
      <Table className="tabular-nums">
        <TableCaption className="sr-only">Prévision par mois</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className={stickyFirst}>Mois</TableHead>
            {amountHeaders.map((header) => (
              <TableHead key={header} className="text-right">
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {months.map((month) => (
            <TableRow key={month.month}>
              <TableHead
                scope="row"
                className={`${stickyFirst} font-medium capitalize text-foreground`}
              >
                {formatMonth(month.month)}
              </TableHead>
              <TableCell className={`text-right ${amountTone(month.income)}`}>
                {formatSignedCents(month.income)}
              </TableCell>
              <TableCell
                className={`text-right ${amountTone(-month.expenses)}`}
              >
                {formatSignedCents(-month.expenses)}
              </TableCell>
              <TableCell className={`text-right ${amountTone(month.net)}`}>
                {formatSignedCents(month.net)}
              </TableCell>
              <TableCell
                className={`text-right ${amountTone(month.minimum.amount)}`}
              >
                {formatCents(month.minimum.amount)}
                <span className="text-muted-foreground">
                  {' '}
                  · {formatDate(month.minimum.date)}
                </span>
              </TableCell>
              <TableCell className={`text-right ${amountTone(month.closing)}`}>
                {formatCents(month.closing)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
