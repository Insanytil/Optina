export class ServerUnavailableError extends Error {
  constructor() {
    super(
      'Le serveur est momentanément injoignable. Veuillez réessayer dans quelques instants.',
    )
    this.name = 'ServerUnavailableError'
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message?: string,
  ) {
    super(
      message ??
        (status === 401
          ? 'Email ou mot de passe incorrect.'
          : 'Le serveur ne peut pas traiter votre demande. Réessayez.'),
    )
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body) headers.set('Content-Type', 'application/json')
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(
      (options.method ?? 'GET').toUpperCase(),
    )
  ) {
    const name = import.meta.env.VITE_CSRF_COOKIE_NAME || 'optina_csrf'
    const cookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${name}=`))
    if (cookie)
      headers.set(
        'X-CSRF-Token',
        decodeURIComponent(cookie.slice(name.length + 1)),
      )
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'include',
      signal: options.signal ?? AbortSignal.timeout(10_000),
    })
  } catch {
    throw new ServerUnavailableError()
  }
  if (
    response.status === 401 &&
    path !== '/auth/login' &&
    path !== '/auth/me'
  ) {
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (response.status >= 500) throw new ServerUnavailableError()
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null)
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? body.detail
        : undefined
    throw new ApiError(
      response.status,
      response.status !== 401 && typeof detail === 'string'
        ? detail
        : undefined,
    )
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>)
}
