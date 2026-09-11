'use client'

import { useEffect, useState, useCallback } from 'react'
import { Tobacco } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Search,
  Package,
  AlertTriangle,
  TrendingUp,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
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

interface EditFormState {
  brand: string
  line: string
  flavor: string
  defaultJarGrams: string
  thresholdGrams: string
  currentGrams: string
  notes: string
}

export function Dashboard({ refreshKey, onRefresh }: DashboardProps) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'ok'>('all')
  const [editing, setEditing] = useState<Tobacco | null>(null)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  const openEdit = (t: Tobacco) => {
    setEditing(t)
    setEditForm({
      brand: t.brand,
      line: t.line,
      flavor: t.flavor,
      defaultJarGrams: String(t.defaultJarGrams),
      thresholdGrams: String(t.thresholdGrams),
      currentGrams: String(t.currentGrams),
      notes: t.notes ?? '',
    })
  }

  const closeEdit = () => {
    setEditing(null)
    setEditForm(null)
  }

  const saveEdit = async () => {
    if (!editing || !editForm) return
    setSaving(true)
    try {
      const body = {
        id: editing.id,
        brand: editForm.brand.trim(),
        line: editForm.line.trim(),
        flavor: editForm.flavor.trim(),
        defaultJarGrams: Number(editForm.defaultJarGrams),
        thresholdGrams: Number(editForm.thresholdGrams),
        currentGrams: Number(editForm.currentGrams),
        notes: editForm.notes.trim() || null,
      }
      const res = await fetch('/api/tobaccos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка сохранения')
      } else {
        toast.success(data.message || 'Сохранено')
        closeEdit()
        load()
        onRefresh()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const deleteTobacco = async () => {
    if (!editing) return
    setDeleting(true)
    try {
      const res = await fetch('/api/tobaccos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка удаления')
      } else {
        toast.success(data.message || 'Удалено')
        closeEdit()
        load()
        onRefresh()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setDeleting(false)
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
        <Button
          size="icon"
          variant="outline"
          onClick={() => {
            load()
            onRefresh()
          }}
          title="Обновить"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Позиций" value={tobaccos.length} icon={Package} />
        <StatCard
          label="Мало"
          value={lowCount}
          icon={AlertTriangle}
          accent={lowCount > 0}
        />
        <StatCard label="Грамм всего" value={totalGrams} icon={TrendingUp} />
        <StatCard
          label="Ср. остаток"
          value={
            tobaccos.length > 0 ? Math.round(totalGrams / tobaccos.length) : 0
          }
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

      {/* Список табаков — без ScrollArea, рамка оборачивает весь список */}
      <div className="border border-border">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs font-mono uppercase tracking-tight flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Ничего не найдено.
          </div>
        ) : (
          <div>
            {filtered.map((t) => {
              const percent = Math.min(
                100,
                Math.round((t.currentGrams / t.defaultJarGrams) * 100),
              )
              return (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => openEdit(t)}
                  className="group w-full text-left flex items-center gap-4 p-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                        {t.brand}
                      </span>
                      <span className="font-mono text-[11px] uppercase tracking-tight text-ink-faint truncate">
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
                    {/* Тонкая 2px линия вместо Progress-бара */}
                    <div className="flex items-center gap-3 mt-2">
                      <div className="relative h-[2px] flex-1 bg-muted overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            t.isLow ? 'bg-[#dc2f02]' : 'bg-foreground'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <span className="text-[11px] text-ink-faint font-mono tabular-nums whitespace-nowrap">
                        {t.currentGrams} / {t.defaultJarGrams}г
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                      {t.currentGrams}
                    </span>
                    <span className="text-[10px] text-ink-faint font-mono uppercase tracking-tight">
                      г
                    </span>
                    <Pencil className="h-3.5 w-3.5 text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-[11px] text-ink-faint font-mono uppercase tracking-tight">
        Клик по позиции — редактирование
      </p>

      {/* Диалог редактирования */}
      <Dialog
        open={editing !== null && editForm !== null}
        onOpenChange={(o) => {
          if (!o) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <span className="label-mono">Редактирование позиции</span>
            <DialogTitle>
              {editing ? `${editing.brand} ${editing.flavor}` : ''}
            </DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="label-mono">Бренд</Label>
                <Input
                  value={editForm.brand}
                  onChange={(e) =>
                    setEditForm({ ...editForm, brand: e.target.value })
                  }
                  className="font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="label-mono">Линейка</Label>
                <Input
                  value={editForm.line}
                  onChange={(e) =>
                    setEditForm({ ...editForm, line: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="label-mono">Вкус</Label>
                <Input
                  value={editForm.flavor}
                  onChange={(e) =>
                    setEditForm({ ...editForm, flavor: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="label-mono">Банка, г</Label>
                <Input
                  type="number"
                  value={editForm.defaultJarGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      defaultJarGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="label-mono">Порог «мало», г</Label>
                <Input
                  type="number"
                  value={editForm.thresholdGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      thresholdGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular-nums"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="label-mono">Текущий остаток, г</Label>
                <Input
                  type="number"
                  value={editForm.currentGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      currentGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular-nums text-base"
                  placeholder="например, 147"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label className="label-mono">Заметки</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) =>
                    setEditForm({ ...editForm, notes: e.target.value })
                  }
                  placeholder="необязательно"
                  className="min-h-16"
                />
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="border-[#dc2f02] text-[#dc2f02] hover:bg-[#dc2f02] hover:text-white"
                  disabled={deleting || saving}
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Удалить позицию
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="heading-mono">
                    Удалить {editing?.brand} {editing?.flavor}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Это нельзя отменить. Позиция будет скрыта из справочника и
                    остатков.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={deleteTobacco}
                    className="bg-[#dc2f02] text-white hover:bg-[#dc2f02]/85"
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeEdit} disabled={saving}>
                Отмена
              </Button>
              <Button onClick={saveEdit} disabled={saving || !editForm}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
