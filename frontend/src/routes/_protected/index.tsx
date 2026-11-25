import { createFileRoute } from '@tanstack/react-router'
import { UpcomingCalendar } from '@/features/calendar/upcoming-calendar'
import { WalletOverview } from '@/features/wallets/wallet-overview'

export const Route = createFileRoute('/_protected/')({ component: Home })

function Home() {
  return (
    <div className="space-y-8">
      <WalletOverview home />
      <section className="mx-auto max-w-5xl">
        <UpcomingCalendar />
      </section>
    </div>
  )
}
