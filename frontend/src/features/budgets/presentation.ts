export const formatDay = (value: string) =>
  new Intl.DateTimeFormat('fr-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T12:00:00Z`))

export const formatMonth = (value: string) =>
  new Intl.DateTimeFormat('fr-BE', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}-01T12:00:00Z`))
