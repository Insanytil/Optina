import { createFileRoute } from '@tanstack/react-router'
import { BudgetWatch } from '@/features/budgets/budget-watch'
import { UpcomingCalendar } from '@/features/calendar/upcoming-calendar'
import { useUpcomingCalendar } from '@/features/calendar/use-upcoming-calendar'

export const Route = createFileRoute('/_protected/')({
  component: Home,
})

function Home() {
  // One calendar state, so the budget block follows the displayed month.
  const calendar = useUpcomingCalendar()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 xl:flex-row">
      <UpcomingCalendar calendar={calendar} />
      <BudgetWatch
        month={`${calendar.month}-01`}
        hiddenWallets={calendar.hidden}
        className="max-h-96 shrink-0 xl:max-h-none xl:w-[280px]"
      />
    </div>
  )
}
