import { createFileRoute } from '@tanstack/react-router'
import { UpcomingCalendar } from '@/features/calendar/upcoming-calendar'

export const Route = createFileRoute('/_protected/')({
  component: UpcomingCalendar,
})
