'use client'

import { useEffect, useState, useCallback } from 'react'
import { Tobacco } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  Package,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Plus,
  Minus,
} from 'lucide-react'
import { toast } from 'sonner'

interface DashboardProps {
  refreshKey: number
  onRefresh: () => void
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string
  value: number | string
  icon: typeof Package
  accent?: boolean
}) {
  return (
    <div
      className={`relative border border-border p-4 flex flex-col gap-3 ${
        accent ? 'frame' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon
          className={`h-3.5 w-3.5 ${accent ? 'text-[#dc2f02]' : 'text-ink-faint'}`}
        />
      </div>
      <span
        className="font-mono font-bold leading-none tabular-nums text-foreground"
        style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
      >
        {value}
      </span>
    </div>
  )
}

export function Dashboard({ refreshKey, onRefresh }: DashboardProps) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'ok'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tobaccos')
      const data = await res.json()
      setTobaccos(data.tobaccos ?? [])
    } catch {
      toast.error('Не удалось загрузить остатки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const filtered = tobaccos.filter((t) => {
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      t.brand.toLowerCase().includes(q) ||
      t.line.toLowerCase().includes(q) ||
      t.flavor.toLowerCase().includes(q)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'low' && t.isLow) ||
      (filter === 'ok' && !t.isLow)
    return matchesSearch && matchesFilter
  })

  const lowCount = tobaccos.filter((t) => t.isLow).length
  const totalGrams = tobaccos.reduce((sum, t) => sum + t.currentGrams, 0)

  const quickAdjust = async (t: Tobacco, delta: number) => {
    const newGrams = Math.max(0, t.currentGrams + delta)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Установи остаток ${t.brand} ${t.line} ${t.flavor} = ${newGrams} грамм`,
        }),
      })
      const data = await res.json()
      if (data.reply) {
        toast.success(data.reply)
      }
      onRefresh()
    } catch {
      toast.error('Ошибка обновления')
    }
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Инвентарь</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Остатки склада
          </h2>
        </div>
        <Button size="icon" variant="outline" onClick={() => { load(); onRefresh() }} title="Обновить">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Позиций" value={tobaccos.length} icon={Package} />
        <StatCard label="Мало" value={lowCount} icon={AlertTriangle} accent={lowCount > 0} />
        <StatCard label="Грамм всего" value={totalGrams} icon={TrendingUp} />
        <StatCard
          label="Ср. остаток"
          value={tobaccos.length > 0 ? Math.round(totalGrams / tobaccos.length) : 0}
          icon={RefreshCw}
        />
      </div>

      {/* Поиск + фильтры */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-faint" />
          <Input
            placeholder="Поиск по бренду / вкусу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-0 border border-border">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-colors border-r border-border ${
              filter === 'all'
                ? 'bg-foreground text-background'
                : 'text-ink-soft hover:bg-muted'
            }`}
          >
            Все
          </button>
          <button
            onClick={() => setFilter('low')}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-colors border-r border-border ${
              filter === 'low'
                ? 'bg-[#dc2f02] text-white'
                : 'text-ink-soft hover:bg-muted'
            }`}
          >
            Мало
          </button>
          <button
            onClick={() => setFilter('ok')}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-colors ${
              filter === 'ok'
                ? 'bg-foreground text-background'
                : 'text-ink-soft hover:bg-muted'
            }`}
          >
            Достаточно
          </button>
        </div>
      </div>

      {/* Список табаков */}
      <div className="border border-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs font-mono uppercase tracking-tight">
            Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Ничего не найдено.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div>
              {filtered.map((t) => {
                const percent = Math.min(
                  100,
                  Math.round((t.currentGrams / t.defaultJarGrams) * 100),
                )
                return (
                  <div
                    key={t.id}
                    className="group flex items-center gap-4 p-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                          {t.brand}
                        </span>
                        <span className="font-sans text-xs text-ink-soft truncate">
                          {t.line}
                        </span>
                        <span className="font-sans text-sm truncate">
                          {t.flavor}
                        </span>
                        {t.isLow && (
                          <Badge className="border-[#dc2f02] text-[#dc2f02] bg-transparent">
                            мало
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <Progress
                          value={percent}
                          className={`h-[2px] flex-1 ${t.isLow ? '[&>[data-slot=progress-indicator]]:bg-[#dc2f02]' : ''}`}
                        />
                        <span className="text-[11px] text-ink-faint font-mono tabular-nums whitespace-nowrap">
                          {t.currentGrams} / {t.defaultJarGrams}г
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => quickAdjust(t, -25)}
                        title="Убрать 25г"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => quickAdjust(t, 25)}
                        title="Добавить 25г"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
