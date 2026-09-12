'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
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
  Package,
  AlertTriangle,
  RefreshCw,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ArrowRight,
  Boxes,
} from 'lucide-react'
import { toast } from 'sonner'

export interface Consumable {
  id: string
  name: string
  unit: string
  currentQty: number
  threshold: number
  isLow: boolean
}

interface ConsumablesPanelProps {
  // Если role === 'REGULAR' — режим read-only: видно, можно «→ заказ»
  // Если role === 'SENIOR' — полный доступ (create/edit/delete)
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
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

export function ConsumablesPanel({
  role,
  refreshKey,
  onRefresh,
}: ConsumablesPanelProps) {
  const canEdit = role === 'SENIOR'
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
      const data = await res.json()
      setItems(data.consumables ?? [])
    } catch {
      toast.error('Не удалось загрузить расходники')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'low') return items.filter((c) => c.isLow)
    return items.filter((c) => !c.isLow)
  }, [items, filter])

  const lowCount = items.filter((c) => c.isLow).length

  const openAdd = () => {
    setEditForm({ ...EMPTY_FORM })
  }

  const openEdit = (c: Consumable) => {
    if (!canEdit) return
    setEditForm({
      id: c.id,
      name: c.name,
      unit: c.unit,
      currentQty: String(c.currentQty),
      threshold: String(c.threshold),
    })
  }

  const closeEdit = () => {
    if (saving) return
    setEditForm(null)
  }

  const saveEdit = async () => {
    if (!editForm) return
    const name = editForm.name.trim()
    if (!name) {
      toast.error('Введите название')
      return
    }
    const unit = editForm.unit.trim() || 'шт'
    const currentQty = Math.max(0, Number(editForm.currentQty) || 0)
    const threshold = Math.max(0, Number(editForm.threshold) || 0)

    setSaving(true)
    try {
      const isEdit = Boolean(editForm.id)
      const body: Record<string, unknown> = {
        name,
        unit,
        currentQty,
        threshold,
      }
      if (isEdit) body.id = editForm.id
      const res = await fetch(
        '/api/consumables',
        isEdit
          ? {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            },
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка сохранения')
      } else {
        toast.success(data.message || (isEdit ? 'Сохранено' : 'Добавлено'))
        setEditForm(null)
        load()
        onRefresh()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const deleteItem = async () => {
    if (!editForm?.id) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/consumables?id=${editForm.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка удаления')
      } else {
        toast.success(data.message || 'Удалено')
        setEditForm(null)
        load()
        onRefresh()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setDeleting(false)
    }
  }

  // Быстрый заказ — создаёт MasterRequest с текстом "{name} — 1 {unit}"
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
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Не удалось создать заявку')
      } else {
        toast.success(`Заявка создана: ${text}`)
        onRefresh()
      }
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setOrderingId(null)
    }
  }

  const isAddMode = editForm && !editForm.id
  const isEditMode = editForm && editForm.id

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div>
          <span className="label-mono">Инвентарь</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Расходники
          </h2>
          <p className="body-sans text-xs text-muted-foreground mt-2">
            Угли, мундштуки, фольга и прочее. Считаем в штуках/упаковках.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => {
              load()
              onRefresh()
            }}
            title="Обновить"
            aria-label="Обновить"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button size="sm" onClick={openAdd} title="Добавить расходник">
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          )}
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-border rounded-md p-4 flex flex-col gap-3 shadow-sm-soft transition-base">
          <div className="flex items-center justify-between">
            <span className="label-mono">Позиций</span>
            <Boxes className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <span
            className="font-mono font-bold leading-none tabular text-foreground"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {items.length}
          </span>
        </div>
        <div
          className={`border rounded-md p-4 flex flex-col gap-3 shadow-sm-soft transition-base ${
            lowCount > 0 ? 'frame-ember' : 'border-border'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="label-mono">Мало</span>
            <AlertTriangle
              className={`h-3.5 w-3.5 ${lowCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`}
            />
          </div>
          <span
            className={`font-mono font-bold leading-none tabular ${
              lowCount > 0 ? 'text-ember' : 'text-foreground'
            }`}
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {lowCount}
          </span>
        </div>
        <div className="border border-border rounded-md p-4 flex flex-col gap-3 shadow-sm-soft">
          <div className="flex items-center justify-between">
            <span className="label-mono">Достаточно</span>
            <Package className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <span
            className="font-mono font-bold leading-none tabular text-foreground"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {items.length - lowCount}
          </span>
        </div>
        <div className="border border-border rounded-md p-4 flex flex-col gap-3 shadow-sm-soft">
          <div className="flex items-center justify-between">
            <span className="label-mono">Всего шт.</span>
            <Boxes className="h-3.5 w-3.5 text-muted-foreground/70" />
          </div>
          <span
            className="font-mono font-bold leading-none tabular text-foreground"
            style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
          >
            {items.reduce((sum, c) => sum + c.currentQty, 0)}
          </span>
        </div>
      </div>

      {/* Фильтр чипы */}
      <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => setFilter('low')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'low'
              ? 'bg-ember text-ember-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Мало
        </button>
        <button
          onClick={() => setFilter('ok')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
            filter === 'ok'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Достаточно
        </button>
      </div>

      {/* Список — плоский */}
      <div className="border border-border rounded-md shadow-sm-soft overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {items.length === 0
              ? canEdit
                ? 'Расходников пока нет. Добавьте первый.'
                : 'Расходников пока нет.'
              : 'Ничего не найдено.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {filtered.map((c) => {
                const percent =
                  c.threshold > 0
                    ? Math.min(100, Math.round((c.currentQty / Math.max(c.threshold * 2, 1)) * 100))
                    : 100
                return (
                  <div
                    key={c.id}
                    role={canEdit ? 'button' : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                    onClick={() => openEdit(c)}
                    onKeyDown={(e) => {
                      if (!canEdit) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openEdit(c)
                      }
                    }}
                    className="group w-full text-left flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50 transition-base transition-colors cursor-pointer"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="body-sans text-sm truncate text-foreground">
                          {c.name}
                        </span>
                        <span className="label-mono-sm text-muted-foreground shrink-0">
                          {c.unit}
                        </span>
                        {c.isLow && (
                          <Badge className="border-ember text-ember bg-transparent shrink-0">
                            мало
                          </Badge>
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
                          {c.currentQty} / {c.threshold}
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
                          title="Быстрый заказ 1 упаковки"
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
                      {canEdit && (
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

      {/* Подсказка */}
      {!canEdit && (
        <p className="label-mono-sm">
          Режим просмотра · «→ заказ» отправит заявку старшему
        </p>
      )}
      {canEdit && (
        <p className="label-mono-sm">
          Клик по позиции — редактирование · «→ заказ» — быстрый заказ 1 упаковки
        </p>
      )}

      {/* Диалог добавления/редактирования */}
      <Dialog
        open={editForm !== null}
        onOpenChange={(o) => {
          if (!o) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <span className="label-mono">
              {isAddMode ? 'Новый расходник' : 'Редактирование расходника'}
            </span>
            <DialogTitle>
              {isEditMode ? editForm?.name || 'Расходник' : 'Добавить расходник'}
            </DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-name">
                  Название <span className="text-ember">*</span>
                </Label>
                <Input
                  id="c-name"
                  placeholder="Угли Cocourth 26мм"
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm({ ...editForm, name: e.target.value })
                  }
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-unit">Единица</Label>
                <Input
                  id="c-unit"
                  placeholder="шт"
                  value={editForm.unit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, unit: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-threshold">Порог «мало»</Label>
                <Input
                  id="c-threshold"
                  type="number"
                  min={0}
                  value={editForm.threshold}
                  onChange={(e) =>
                    setEditForm({ ...editForm, threshold: e.target.value })
                  }
                  className="font-mono tabular"
                />
              </div>
              {isEditMode && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="c-qty">Текущий остаток</Label>
                  <Input
                    id="c-qty"
                    type="number"
                    min={0}
                    value={editForm.currentQty}
                    onChange={(e) =>
                      setEditForm({ ...editForm, currentQty: e.target.value })
                    }
                    className="font-mono tabular"
                  />
                  <p className="label-mono-sm">
                    Если меняется — обновится и timestamp изменения
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between sm:gap-0">
            {isEditMode ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-ember hover:bg-ember hover:text-ember-foreground"
                    disabled={saving || deleting}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Удалить
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Удалить расходник?</AlertDialogTitle>
                    <AlertDialogDescription>
                      «{editForm?.name}» будет скрыт из списка. Это действие
                      можно отменить только в БД.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Отмена</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={deleteItem}
                      className="bg-ember text-ember-foreground hover:bg-ember/90"
                    >
                      Удалить
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button variant="outline" disabled={saving || deleting}>
                  Отмена
                </Button>
              </DialogClose>
              <Button onClick={saveEdit} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {isEditMode ? 'Сохранить' : 'Добавить'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
