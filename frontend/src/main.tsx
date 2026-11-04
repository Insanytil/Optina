import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/features/auth/session'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'

const router = getRouter()
window.addEventListener('auth:expired', () => {
  queryClient.clear()
  if (router.state.location.pathname !== '/login') void router.invalidate()
})

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}
