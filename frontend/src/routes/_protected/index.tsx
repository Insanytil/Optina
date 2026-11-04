import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_protected/')({ component: Home })

function Home() {
  return (
    <section className="mx-auto max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-tight">Bienvenue</h1>
      <p className="mt-3 text-muted-foreground">
        Retrouvez votre espace et accédez à vos pages depuis le menu.
      </p>
    </section>
  )
}
