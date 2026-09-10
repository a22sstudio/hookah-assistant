'use client'

import { useEffect, useState, useCallback } from 'react'
import { Tobacco } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <div className="space-y-4">
      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-emerald-100 dark:bg-emerald-950 p-2">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{tobaccos.length}</p>
              <p className="text-xs text-muted-foreground mt-1">позиций</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-950 p-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{lowCount}</p>
              <p className="text-xs text-muted-foreground mt-1">мало</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-sky-100 dark:bg-sky-950 p-2">
              <TrendingUp className="h-5 w-5 text-sky-600 dark:text-sky-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">{totalGrams}</p>
              <p className="text-xs text-muted-foreground mt-1">грамм всего</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 dark:bg-violet-950 p-2">
              <RefreshCw className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-2xl font-bold leading-none">
                {tobaccos.length > 0
                  ? Math.round(totalGrams / tobaccos.length)
                  : 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">ср. остаток</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Поиск + фильтры */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Поиск по бренду, линейке, вкусу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')}
          >
            Все
          </Button>
          <Button
            size="sm"
            variant={filter === 'low' ? 'default' : 'outline'}
            onClick={() => setFilter('low')}
            className={filter === 'low' ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            Мало
          </Button>
          <Button
            size="sm"
            variant={filter === 'ok' ? 'default' : 'outline'}
            onClick={() => setFilter('ok')}
          >
            Достаточно
          </Button>
          <Button size="icon" variant="outline" onClick={() => { load(); onRefresh() }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Список табаков */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Остатки на складе</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Загрузка...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              Ничего не найдено
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="divide-y">
                {filtered.map((t) => {
                  const percent = Math.min(
                    100,
                    Math.round((t.currentGrams / t.defaultJarGrams) * 100),
                  )
                  return (
                    <div
                      key={t.id}
                      className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {t.brand}
                          </span>
                          <span className="text-muted-foreground text-sm">
                            {t.line}
                          </span>
                          <span className="text-sm truncate">{t.flavor}</span>
                          {t.isLow && (
                            <Badge
                              variant="outline"
                              className="text-amber-700 border-amber-400 bg-amber-50 dark:bg-amber-950 dark:text-amber-400"
                            >
                              мало
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <Progress value={percent} className="h-1.5 flex-1" />
                          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {t.currentGrams} / {t.defaultJarGrams}г
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
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
        </CardContent>
      </Card>
    </div>
  )
}
