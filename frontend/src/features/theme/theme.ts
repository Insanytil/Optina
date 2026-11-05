export function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
}
export function initializeTheme() {
  let theme: 'dark' | 'light' = 'dark'
  try {
    if (localStorage.getItem('theme') === 'light') theme = 'light'
  } catch {
    /* Storage may be unavailable. */
  }
  applyTheme(theme)
}
