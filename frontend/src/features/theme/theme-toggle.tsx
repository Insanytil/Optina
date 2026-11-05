import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyTheme } from './theme'

export function ThemeToggle() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )
  return (
    <Button
      variant="ghost"
      className="h-9 w-full justify-start text-muted-foreground"
      onClick={() => {
        const theme = dark ? 'light' : 'dark'
        applyTheme(theme)
        setDark(!dark)
        try {
          localStorage.setItem('theme', theme)
        } catch {
          /* Preference remains in memory. */
        }
      }}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
      {dark ? 'Mode clair' : 'Mode sombre'}
    </Button>
  )
}
