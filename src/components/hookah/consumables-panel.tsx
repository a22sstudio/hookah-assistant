'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Package,
  AlertTriangle,
  RefreshCw,
  Pencil,
  Trash2,
  Loader2,
  Plus,
  ArrowRight,
} from 'lucide-react'
import { toast } from 'sonner'

export interface Consumable {
  id: string
  name: string
  unit: string
  currentQty: number
  threshold: number
  active: boolean
  isLow: boolean
  createdAt: string
  updatedAt: string
}

interface ConsumablesPanelProps {
  refreshKey: number
  onRefresh: () => void
  readOnly?: boolean
}

type FilterChip = 'all' | 'low' | 'ok'

interface EditForm {
  id?: string
  name: string
  unit: string
  currentQty: string
  threshold: string
}

const EMPTY_FORM: EditForm = {
  name: '',
  unit: 'шт',
  currentQty: '0',
  threshold: '5',
}

const UNIT_OPTIONS = ['шт', 'упаковок', 'уп', 'коробок', 'блоков', 'метров', 'м', 'рулонов']

export function ConsumablesPanel({ refreshKey, onRefresh, readOnly = false }: ConsumablesPanelProps) {
  const [items, setItems] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterChip>('all')
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [orderingId, setOrderingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/consumables')
      if (!res.ok) {
        toast.error('Не удалось загрузить расходники')
        return
      }
      const d = await res.json()
      setItems(d.consumables ?? [])
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const lowCount = items.filter((c) => c.isLow).length
  const totalCount = items.length

  const filtered = useMemo(() => {
    if (filter === 'low') return items.filter((c) => c.isLow)
    if (filter === 'ok') return items.filter((c) => !c.isLow)
    return items
  }, [items, filter])

  const openEdit = (c: Consumable) => {
    if (readOnly) return
    setEditForm({
      id: c.id,
      name: c.name,
      unit: c.unit,
      currentQty: String(c.currentQty),
      threshold: String(c.threshold),
    })
  }

  const openAdd = () => {
    if (readOnly) return
    setEditForm({ ...EMPTY_FORM })
  }

  const closeEdit = () => setEditForm(null)

  const saveEdit = async () => {
    if (!editForm) return
    const name = editForm.name.trim()
    if (!name) {
      toast.error('Укажите название')
      return
    }
    setSaving(true)
    try {
      const isEdit = Boolean(editForm.id)
      const body = {
        ...(isEdit ? { id: editForm.id } : {}),
        name,
        unit: editForm.unit.trim() || 'шт',
        currentQty: Number(editForm.currentQty) || 0,
        threshold: Number(editForm.threshold) || 0,
      }
      const res = await fetch(
        '/api/consumables',
        isEdit
          ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
          : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      )
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка сохранения')
        return
      }
      toast.success(isEdit ? 'Сохранено' : 'Добавлено')
      closeEdit()
      load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const deleteConsumable = async () => {
    if (!editForm?.id) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/consumables?id=${editForm.id}&hard=1`, {
        method: 'DELETE',
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка удаления')
        return
      }
      toast.success('Удалено')
      closeEdit()
      load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setDeleting(false)
    }
  }

  const quickOrder = async (c: Consumable, e: React.MouseEvent) => {
    e.stopPropagation()
    setOrderingId(c.id)
    try {
      const text = `${c.name} — 1 ${c.unit}`
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка создания заявки')
        return
      }
      toast.success(`Заявка создана: ${text}`)
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setOrderingId(null)
    }
  }

  const isAddMode = editForm && !editForm.id
  const isEditMode = editForm && editForm.id
  const canSave = !!editForm?.name.trim()

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
            Расходники
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => { load(); onRefresh() }}
            title="Обновить"
            aria-label="Обновить"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {!readOnly && (
            <Button size="sm" onClick={openAdd} title="Добавить расходник">
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft">
          <div className="flex items-center justify-between">
            <span className="label-mono">Всего</span>
            <Package className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <span className="font-mono font-bold tabular text-foreground" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
            {totalCount}
          </span>
        </div>
        <div className={`border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft ${lowCount > 0 ? 'frame-ember' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <span className="label-mono">Мало</span>
            <AlertTriangle className={`h-3.5 w-3.5 ${lowCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`} />
          </div>
          <span className="font-mono font-bold tabular text-foreground" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
            {lowCount}
          </span>
        </div>
        <div className="border border-border rounded-md p-4 flex flex-col gap-2 shadow-sm-soft">
          <div className="flex items-center justify-between">
            <span className="label-mono">Достаточно</span>
            <Package className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <span className="font-mono font-bold tabular text-foreground" style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}>
            {totalCount - lowCount}
          </span>
        </div>
      </div>

      {/* Фильтры */}
      <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'all' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => setFilter('low')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'low' ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Мало
        </button>
        <button
          onClick={() => setFilter('ok')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
            filter === 'ok' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Достаточно
        </button>
      </div>

      {/* Список расходников */}
      <div className="border border-border rounded-md shadow-sm-soft overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {filter !== 'all' ? 'Ничего не найдено.' : 'Список расходников пуст.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {filtered.map((c) => {
                const percent = Math.min(100, c.threshold > 0 ? Math.round((c.currentQty / (c.threshold * 2)) * 100) : 100)
                return (
                  <div
                    key={c.id}
                    role={readOnly ? undefined : 'button'}
                    tabIndex={readOnly ? undefined : 0}
                    onClick={() => openEdit(c)}
                    onKeyDown={(e) => {
                      if (readOnly) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEdit(c)
                      }
                    }}
                    className="group w-full text-left flex items-center gap-4 px-4 py-3 border-t border-border first:border-t-0 hover:bg-muted/50 transition-base transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-sans text-sm text-foreground truncate">{c.name}</span>
                        {c.isLow && (
                          <Badge className="border-ember text-ember bg-transparent">мало</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2">
                        <div className="relative h-[2px] flex-1 bg-muted overflow-hidden rounded-full">
                          <div
                            className={`absolute inset-y-0 left-0 transition-moderate transition-[width] ${
                              c.isLow ? 'bg-ember' : 'bg-foreground'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                        <span className="label-mono-sm tabular whitespace-nowrap">
                          {c.currentQty} / {c.threshold} {c.unit}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.isLow && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] border-ember text-ember hover:bg-ember hover:text-ember-foreground"
                          onClick={(e) => quickOrder(c, e)}
                          disabled={orderingId === c.id}
                          title="Создать заявку"
                        >
                          {orderingId === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <ArrowRight className="h-3 w-3" />
                          )}
                          заказ
                        </Button>
                      )}
                      <span className="font-mono text-sm font-bold tabular text-foreground">
                        {c.currentQty}
                      </span>
                      <span className="label-mono-sm">{c.unit}</span>
                      {!readOnly && (
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-base" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {!readOnly && (
        <p className="label-mono-sm">
          Клик по позиции — редактирование · «→ заказ» — отправить заявку на закуп 1 {''}
          {''}единицы
        </p>
      )}
      {readOnly && (
        <p className="label-mono-sm">Режим просмотра · «→ заказ» отправит заявку старшему</p>
      )}

      {/* Диалог добавления/редактирования */}
      <Dialog
        open={editForm !== null}
        onOpenChange={(o) => { if (!o) closeEdit() }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <span className="label-mono">
              {isAddMode ? 'Новый расходник' : 'Редактирование'}
            </span>
            <DialogTitle>
              {isEditMode ? editForm?.name : 'Добавить расходник'}
            </DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  Название <span className="text-ember">*</span>
                </Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Угли Cocourth 26мм"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <Label>Единица</Label>
                <Select
                  value={UNIT_OPTIONS.includes(editForm.unit) ? editForm.unit : '__custom__'}
                  onValueChange={(v) => {
                    if (v !== '__custom__') setEditForm({ ...editForm, unit: v })
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Единица">
                    <SelectValue placeholder="шт" />
                  </SelectTrigger>
                  <SelectContent>
                    {UNIT_OPTIONS.map((u) => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                    <SelectItem value="__custom__">своя...</SelectItem>
                  </SelectContent>
                </Select>
                {!UNIT_OPTIONS.includes(editForm.unit) && (
                  <Input
                    value={editForm.unit}
                    onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                    placeholder="своя единица"
                    className="font-mono"
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Количество</Label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.currentQty}
                  onChange={(e) => setEditForm({ ...editForm, currentQty: e.target.value })}
                  className="font-mono tabular"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Порог «мало»</Label>
                <Input
                  type="number"
                  min={0}
                  value={editForm.threshold}
                  onChange={(e) => setEditForm({ ...editForm, threshold: e.target.value })}
                  className="font-mono tabular"
                />
              </div>
            </div>
          )}

          <DialogFooter className="sm:justify-between gap-2">
            <div className="flex gap-2">
              {isEditMode && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="border-ember text-ember hover:bg-ember hover:text-ember-foreground"
                      disabled={deleting || saving}
                    >
                      {deleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Удалить
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить {editForm?.name}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Это нельзя отменить. Расходник будет удалён полностью.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteConsumable}>Удалить</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeEdit} disabled={saving}>
                Отмена
              </Button>
              <Button onClick={saveEdit} disabled={saving || !canSave}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : isAddMode ? (
                  <Plus className="h-3.5 w-3.5" />
                ) : null}
                {isAddMode ? 'Добавить' : 'Сохранить'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
