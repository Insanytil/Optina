import { createFileRoute } from '@tanstack/react-router'
import { GlobalOverview } from '@/features/wallets/global-overview'

export const Route = createFileRoute('/_protected/overview')({
  component: GlobalOverview,
})
