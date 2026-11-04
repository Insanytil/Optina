import { SessionProvider } from '@/features/auth/session-provider'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient, setAnonymousSession } from '@/features/auth/session'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'

const router = getRouter()
window.addEventListener('auth:expired', () => {
  setAnonymousSession()
})

const onSessionChange = () => {
  void router.invalidate()
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider onSessionChange={onSessionChange}>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>,
  )
}
