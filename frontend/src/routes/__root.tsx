import { Outlet, createRootRoute, useRouter } from '@tanstack/react-router'

import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { Button } from '@/components/ui/button'
import { ServerUnavailableError } from '@/lib/api'
import type { ErrorComponentProps } from '@tanstack/react-router'

import '../styles.css'

export const Route = createRootRoute({
  component: RootComponent,
  pendingComponent: () => (
    <main className="grid min-h-svh place-items-center" role="status">
      Chargement…
    </main>
  ),
  errorComponent: RootError,
})

function RootError({ error }: ErrorComponentProps) {
  const router = useRouter()
  const unavailable = error instanceof ServerUnavailableError
  return (
    <main className="grid min-h-svh place-content-center gap-5 bg-muted/40 p-6 text-center">
      <p className="text-lg font-semibold tracking-tight">Optina</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {unavailable ? 'Serveur momentanément injoignable' : 'Impossible de charger votre espace'}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground" role="alert">
        {unavailable
          ? 'Nous ne pouvons pas contacter le serveur pour le moment. Veuillez réessayer dans quelques instants.'
          : 'Une erreur est survenue lors du chargement. Veuillez réessayer.'}
      </p>
      <Button className="justify-self-center" onClick={() => void router.invalidate()}>
        Réessayer
      </Button>
    </main>
  )
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'TanStack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </>
  )
}
