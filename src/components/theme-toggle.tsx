'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

const THEME_KEY = 'theme'

// External store: subscribes to localStorage + matchMedia changes
function subscribe(callback: () => void): () => void {
  // Listen to storage events (other tabs)
  window.addEventListener('storage', callback)
  // Listen to system preference changes
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  if (mql.addEventListener) {
    mql.addEventListener('change', callback)
  } else {
    // Safari fallback
    mql.addListener(callback)
  }
  return () => {
    window.removeEventListener('storage', callback)
    if (mql.removeEventListener) {
      mql.removeEventListener('change', callback)
    } else {
      mql.removeListener(callback)
    }
  }
}

function getTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const stored = localStorage.getItem(THEME_KEY) as Theme | null
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getServerTheme(): Theme {
  return 'light'
}

/**
 * Synchronizes the `<html>` dark class with the resolved theme.
 * Idempotent — safe to call repeatedly.
 */
function syncClassList(theme: Theme) {
  if (typeof document === 'undefined') return
  if (theme === 'dark') document.documentElement.classList.add('dark')
  else document.documentElement.classList.remove('dark')
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getTheme,
    getServerTheme,
  )

  const setTheme = useCallback((t: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      // ignore
    }
    syncClassList(t)
    // Trigger an external store update via a synthetic storage event
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_KEY, newValue: t }))
  }, [])

  const toggleTheme = useCallback(
    () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, setTheme],
  )

  // mounted: always true on client after hydration
  const mounted = typeof window !== 'undefined'

  // Sync class on every change
  if (mounted) syncClassList(theme)

  return { theme, setTheme, toggleTheme, mounted }
}

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme()

  if (!mounted) {
    return <div className="w-9 h-9" /> // placeholder для предотвращения layout shift
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      className="w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:border-foreground rounded-md transition-base transition-colors"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
