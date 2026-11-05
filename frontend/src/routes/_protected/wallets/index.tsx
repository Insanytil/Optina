import { createFileRoute } from '@tanstack/react-router'
import { WalletOverview } from '@/features/wallets/wallet-overview'

export const Route = createFileRoute('/_protected/wallets/')({
  component: WalletOverview,
})
