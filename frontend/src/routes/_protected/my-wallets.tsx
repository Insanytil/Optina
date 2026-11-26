import { createFileRoute } from '@tanstack/react-router'
import { MyWallets } from '@/features/wallets/my-wallets'

export const Route = createFileRoute('/_protected/my-wallets')({
  component: MyWallets,
})
