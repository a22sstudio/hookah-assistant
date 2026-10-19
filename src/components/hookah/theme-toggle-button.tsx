'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

/**
 * Compact theme toggle button — fits into header.
 * Uses shared useTheme hook (with localStorage + matchMedia subscription).
 */
export function ThemeToggleButton() {
  const { theme, toggleTheme, mounted } = useTheme()

  if (!mounted) {
    return <div className="w-9 h-9" aria-hidden />
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
      className={cn(
        'w-9 h-9 flex items-center justify-center rounded-md',
        'text-muted-foreground hover:text-foreground',
        'border border-border hover:border-border-strong',
        'hover:bg-muted transition-base transition-colors',
      )}
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
