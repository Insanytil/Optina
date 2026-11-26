import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WalletGrid } from './wallet-grid'

/** Read-only list of wallets and their balances. */
export function MyWallets() {
  const [page, setPage] = useState(1)
  const manage = (
    <Button nativeButton={false} render={<Link to="/wallets" />}>
      <Settings2 aria-hidden="true" />
      Gérer mes portefeuilles
    </Button>
  )
  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Vos portefeuilles
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Retrouvez vos comptes et leurs soldes au même endroit.
          </p>
        </div>
        {manage}
      </header>
      <WalletGrid page={page} onPageChange={setPage} emptyAction={manage} />
    </section>
  )
}
