// Хелперы для работы с мастерами: цвет аватара, инициалы, форматирование времени

// Маппинг кода цвета мастера на Tailwind-классы
const MASTER_COLOR_MAP: Record<string, { bg: string; text: string; ring: string; soft: string }> = {
  emerald: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    ring: 'ring-emerald-500',
    soft: 'bg-emerald-100 dark:bg-emerald-950',
  },
  teal: {
    bg: 'bg-teal-500',
    text: 'text-teal-600 dark:text-teal-400',
    ring: 'ring-teal-500',
    soft: 'bg-teal-100 dark:bg-teal-950',
  },
  amber: {
    bg: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500',
    soft: 'bg-amber-100 dark:bg-amber-950',
  },
  sky: {
    bg: 'bg-sky-500',
    text: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500',
    soft: 'bg-sky-100 dark:bg-sky-950',
  },
  violet: {
    bg: 'bg-violet-500',
    text: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500',
    soft: 'bg-violet-100 dark:bg-violet-950',
  },
  rose: {
    bg: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500',
    soft: 'bg-rose-100 dark:bg-rose-950',
  },
}

const FALLBACK = MASTER_COLOR_MAP.emerald

export function masterColorClasses(color: string) {
  return MASTER_COLOR_MAP[color] ?? FALLBACK
}

export function masterAvatarClass(color: string) {
  return (MASTER_COLOR_MAP[color] ?? FALLBACK).bg
}

// Инициалы из имени (первые буквы первых двух слов)
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase()
  }
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

// "только что", "5 мин назад", "2 ч назад", "вчера 14:30"
export function timeAgo(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  if (mins < 1) return 'только что'
  if (mins < 60) return `${mins} мин назад`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн назад`
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}

// "14:30" — только часы:минуты
export function formatHHMM(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// "2 ч 15 мин" — длительность смены с момента openedAt до сейчас
export function shiftDuration(openedAt: string): string {
  const start = new Date(openedAt).getTime()
  const diffMs = Date.now() - start
  if (diffMs < 0) return '0 мин'
  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} мин`
  return `${h} ч ${m.toString().padStart(2, '0')} мин`
}

// Короткая длительность: "2ч 15м" (для мелких карточек)
export function shiftDurationShort(openedAt: string): string {
  const start = new Date(openedAt).getTime()
  const diffMs = Date.now() - start
  if (diffMs < 0) return '0м'
  const totalMin = Math.floor(diffMs / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}м`
  return `${h}ч ${m}м`
}
