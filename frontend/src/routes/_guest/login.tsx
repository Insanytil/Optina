import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { getSession, queryClient, safeRedirect } from '@/features/auth/session'

export const Route = createFileRoute('/_guest/login')({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  component: LoginPage,
})

const schema = z.object({
  email: z.email('Saisissez une adresse email valide.').max(320),
  password: z.string().min(1, 'Saisissez votre mot de passe.').max(1024),
})

function LoginPage() {
  const router = useRouter()
  const { redirect } = Route.useSearch()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) })

  const submit = handleSubmit(async (values) => {
    try {
      await api<void>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      queryClient.clear()
      if (!(await getSession()))
        throw new Error('La session n’a pas pu être établie. Réessayez.')
      await router.invalidate()
      await router.navigate({ href: redirect, replace: true })
    } catch (error) {
      setError('root', {
        message:
          error instanceof Error ? error.message : 'La connexion a échoué.',
      })
    }
  })

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="mb-6 text-lg font-semibold tracking-tight">Optina</p>
          <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connectez-vous à votre espace.
          </p>
        </div>
        <form
          onSubmit={submit}
          noValidate
          className="space-y-5 rounded-xl border bg-card p-6 shadow-sm"
          aria-busy={isSubmitting}
        >
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="vous@exemple.fr"
              className="h-10"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              disabled={isSubmitting}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="text-sm text-destructive">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              className="h-10"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              disabled={isSubmitting}
              {...register('password')}
            />
            {errors.password && (
              <p id="password-error" className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          {errors.root && (
            <p role="alert" className="text-sm text-destructive">
              {errors.root.message}
            </p>
          )}
          <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
            {isSubmitting && (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            )}
            {isSubmitting ? 'Connexion en cours…' : 'Se connecter'}
          </Button>
        </form>
      </div>
    </main>
  )
}
