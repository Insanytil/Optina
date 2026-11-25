import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { Wallet } from '@/features/wallets/api'
import { FORECAST_HORIZONS, parseHorizon } from './forecast-model'
import type { ForecastHorizon } from './forecast-model'

export function ForecastToolbar({
  wallets,
  walletId,
  months,
  onWalletChange,
  onMonthsChange,
}: {
  wallets: Wallet[]
  walletId: string
  months: ForecastHorizon
  onWalletChange: (walletId: string) => void
  onMonthsChange: (months: ForecastHorizon) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <h1 className="mr-auto text-xl font-semibold tracking-tight">
        Prévisions
      </h1>
      <NativeSelect
        aria-label="Portefeuille"
        value={walletId}
        onChange={(event) => onWalletChange(event.target.value)}
      >
        {wallets.map((wallet) => (
          <NativeSelectOption key={wallet.id} value={wallet.id}>
            {wallet.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <ToggleGroup
        aria-label="Horizon"
        variant="outline"
        spacing={0}
        value={[String(months)]}
        onValueChange={(values) => {
          const horizon = parseHorizon(values[0])
          if (horizon) onMonthsChange(horizon)
        }}
      >
        {FORECAST_HORIZONS.map((horizon) => (
          <ToggleGroupItem key={horizon} value={String(horizon)}>
            {horizon} mois
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button
        variant="outline"
        nativeButton={false}
        render={<Link to="/recurrences" search={{ walletId }} />}
      >
        Gérer les récurrences
      </Button>
    </div>
  )
}
