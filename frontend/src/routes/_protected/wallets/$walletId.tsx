import { createFileRoute } from '@tanstack/react-router'
import { WalletDashboard } from '@/features/wallets/wallet-dashboard'

export const Route = createFileRoute('/_protected/wallets/$walletId')({
  component: WalletPage,
})

function WalletPage() {
  const { walletId } = Route.useParams()
  return <WalletDashboard key={walletId} walletId={walletId} />
}
