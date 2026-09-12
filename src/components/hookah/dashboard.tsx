'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Tobacco } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
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
  Plus,
  ArrowRight,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'

interface DashboardProps {
  refreshKey: number
  onRefresh: () => void
  readOnly?: boolean
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
      className={`relative border p-4 flex flex-col gap-3 rounded-md transition-base ${
        accent ? 'frame-ember shadow-sm-soft' : 'border-border shadow-sm-soft'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="label-mono">{label}</span>
        <Icon
          className={`h-3.5 w-3.5 ${accent ? 'text-ember' : 'text-muted-foreground/70'}`}
        />
      </div>
      <span
        className="font-mono font-bold leading-none tabular text-foreground"
        style={{ fontSize: 'clamp(28px, 4vw, 40px)' }}
      >
        {value}
      </span>
    </div>
  )
}

interface EditFormState {
  id?: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: string
  thresholdGrams: string
  currentGrams: string
  notes: string
}

const EMPTY_FORM: EditFormState = {
  brand: '',
  line: '',
  flavor: '',
  defaultJarGrams: '250',
  thresholdGrams: '70',
  currentGrams: '0',
  notes: '',
}

type FilterChip = 'all' | 'low' | 'ok'

export function Dashboard({ refreshKey, onRefresh, readOnly = false }: DashboardProps) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterChip>('all')
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [orderingId, setOrderingId] = useState<string | null>(null)
  const [expandedBrands, setExpandedBrands] = useState<string[]>([])

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

  // Группировка по бренду для аккордеона
  const grouped = useMemo(() => {
    const map: Record<string, Tobacco[]> = {}
    for (const t of filtered) {
      if (!map[t.brand]) map[t.brand] = []
      map[t.brand].push(t)
    }
    // Сортируем по алфавиту по бренду
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  // Все бренды (для управления состоянием expand/collapse)
  const allBrands = useMemo(() => grouped.map(([b]) => b), [grouped])
  const allBrandsKey = allBrands.join('|')

  // По умолчанию все развернуты (только при смене набора брендов)
  useEffect(() => {
    setExpandedBrands(allBrands)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBrandsKey])

  const lowCount = tobaccos.filter((t) => t.isLow).length
  const totalGrams = tobaccos.reduce((sum, t) => sum + t.currentGrams, 0)

  const openEdit = (t: Tobacco) => {
    if (readOnly) return
    setEditForm({
      id: t.id,
      brand: t.brand,
      line: t.line,
      flavor: t.flavor,
      defaultJarGrams: String(t.defaultJarGrams),
      thresholdGrams: String(t.thresholdGrams),
      currentGrams: String(t.currentGrams),
      notes: t.notes ?? '',
    })
  }

  const openAdd = () => {
    if (readOnly) return
    setEditForm({ ...EMPTY_FORM })
  }

  const closeEdit = () => {
    setEditForm(null)
  }

  const saveEdit = async () => {
    if (!editForm) return
    setSaving(true)
    try {
      const isEdit = Boolean(editForm.id)
      const body = {
        ...(isEdit ? { id: editForm.id } : {}),
        brand: editForm.brand.trim(),
        line: editForm.line.trim(),
        flavor: editForm.flavor.trim(),
        defaultJarGrams: Number(editForm.defaultJarGrams) || 250,
        thresholdGrams: Number(editForm.thresholdGrams) || 70,
        currentGrams: Number(editForm.currentGrams) || 0,
        notes: editForm.notes.trim() || null,
      }
      const res = await fetch(
        '/api/tobaccos',
        isEdit
          ? {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }
          : {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                brand: body.brand,
                line: body.line,
                flavor: body.flavor,
                defaultJarGrams: body.defaultJarGrams,
                thresholdGrams: body.thresholdGrams,
                notes: body.notes,
              }),
            },
      )
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка сохранения')
      } else {
        toast.success(data.message || (isEdit ? 'Сохранено' : 'Добавлено'))
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
    if (!editForm?.id) return
    setDeleting(true)
    try {
      const res = await fetch('/api/tobaccos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editForm.id }),
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

  const quickOrder = async (t: Tobacco, e: React.MouseEvent) => {
    e.stopPropagation()
    setOrderingId(t.id)
    try {
      const text = `${t.brand} ${t.line} ${t.flavor} — 1 банка`
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, grams: t.defaultJarGrams }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка создания заявки')
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

  const toggleBrand = (brand: string) => {
    setExpandedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    )
  }

  const isAddMode = editForm && !editForm.id
  const isEditMode = editForm && editForm.id

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
        <div className="flex gap-2">
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
          {!readOnly && (
            <Button
              size="sm"
              onClick={openAdd}
              title="Добавить позицию"
            >
              <Plus className="h-4 w-4" /> Добавить
            </Button>
          )}
        </div>
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

      {/* Поиск + фильтры (чипы) */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
          <Input
            placeholder="Поиск по бренду / вкусу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-0 border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            Весь склад
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
      </div>

      {/* Аккордеон по брендам */}
      <div className="border border-border rounded-md overflow-hidden shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : grouped.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {search || filter !== 'all' ? 'Ничего не найдено.' : 'Справочник пуст.'}
          </div>
        ) : (
          <Accordion
            type="multiple"
            value={expandedBrands}
            onValueChange={(v) => setExpandedBrands(v as string[])}
            className="w-full"
          >
            {grouped.map(([brand, items]) => {
              const brandLowCount = items.filter((t) => t.isLow).length
              return (
                <AccordionItem
                  key={brand}
                  value={brand}
                  className="border-b border-border last:border-b-0"
                >
                  <AccordionTrigger className="px-4 py-3 hover:bg-muted/40 transition-base transition-colors">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono uppercase text-sm font-bold tracking-tight truncate text-foreground">
                        {brand}
                      </span>
                      <span className="label-mono-sm text-muted-foreground shrink-0">
                        {items.length} поз.
                      </span>
                      {brandLowCount > 0 && (
                        <Badge className="border-ember text-ember bg-transparent shrink-0">
                          мало: {brandLowCount}
                        </Badge>
                      )}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-0">
                    <div className="stagger-children">
                      {items.map((t) => {
                        const percent = Math.min(
                          100,
                          Math.round((t.currentGrams / t.defaultJarGrams) * 100),
                        )
                        return (
                          <div
                            key={t.id}
                            role={readOnly ? undefined : 'button'}
                            tabIndex={readOnly ? undefined : 0}
                            onClick={() => openEdit(t)}
                            onKeyDown={(e) => {
                              if (readOnly) return
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                openEdit(t)
                              }
                            }}
                            className="group w-full text-left flex items-center gap-4 p-4 border-t border-border first:border-t-0 hover:bg-muted/50 transition-base transition-colors cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="label-mono-sm truncate">
                                  {t.line}
                                </span>
                                <span className="font-sans text-sm truncate">
                                  {t.flavor}
                                </span>
                                {t.isLow && (
                                  <Badge className="border-ember text-ember bg-transparent">
                                    мало
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-2">
                                <div className="relative h-[2px] flex-1 bg-muted overflow-hidden rounded-full">
                                  <div
                                    className={`absolute inset-y-0 left-0 transition-moderate transition-[width] ${
                                      t.isLow ? 'bg-ember' : 'bg-foreground'
                                    }`}
                                    style={{ width: `${percent}%` }}
                                  />
                                </div>
                                <span className="label-mono-sm tabular whitespace-nowrap">
                                  {t.currentGrams} / {t.defaultJarGrams}г
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {t.isLow && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-[11px] border-ember text-ember hover:bg-ember hover:text-ember-foreground"
                                  onClick={(e) => quickOrder(t, e)}
                                  disabled={orderingId === t.id}
                                  title="Заказать 1 банку"
                                >
                                  {orderingId === t.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <ArrowRight className="h-3 w-3" />
                                  )}
                                  заказ
                                </Button>
                              )}
                              <span className="font-mono text-sm font-bold tabular text-foreground">
                                {t.currentGrams}
                              </span>
                              <span className="label-mono-sm">г</span>
                              {!readOnly && (
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground/70 opacity-0 group-hover:opacity-100 transition-base" />
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </div>

      {/* Подсказка */}
      {!readOnly && (
        <p className="label-mono-sm">
          Клик по позиции — редактирование · «→ заказ» — быстрый заказ 1 банки
        </p>
      )}
      {readOnly && (
        <p className="label-mono-sm">
          Режим просмотра · «→ заказ» отправит заявку старшему
        </p>
      )}

      {/* Свёрнут/развёрнут управления */}
      {grouped.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpandedBrands(allBrands)}
            className="h-7 text-[11px]"
          >
            <ChevronDown className="h-3 w-3" /> Развернуть всё
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpandedBrands([])}
            className="h-7 text-[11px]"
          >
            Свернуть всё
          </Button>
        </div>
      )}

      {/* Диалог редактирования/добавления */}
      <Dialog
        open={editForm !== null}
        onOpenChange={(o) => {
          if (!o) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <span className="label-mono">
              {isAddMode ? 'Новая позиция' : 'Редактирование позиции'}
            </span>
            <DialogTitle>
              {isEditMode
                ? `${editForm?.brand ?? ''} ${editForm?.flavor ?? ''}`
                : 'Добавить табак'}
            </DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Бренд</Label>
                <Input
                  value={editForm.brand}
                  onChange={(e) =>
                    setEditForm({ ...editForm, brand: e.target.value })
                  }
                  className="font-mono"
                  placeholder="Darkside"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Линейка</Label>
                <Input
                  value={editForm.line}
                  onChange={(e) =>
                    setEditForm({ ...editForm, line: e.target.value })
                  }
                  placeholder="Supernova"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Вкус</Label>
                <Input
                  value={editForm.flavor}
                  onChange={(e) =>
                    setEditForm({ ...editForm, flavor: e.target.value })
                  }
                  placeholder="Ice Grape"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Банка, г</Label>
                <Input
                  type="number"
                  value={editForm.defaultJarGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      defaultJarGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Порог «мало», г</Label>
                <Input
                  type="number"
                  value={editForm.thresholdGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      thresholdGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Текущий остаток, г</Label>
                <Input
                  type="number"
                  value={editForm.currentGrams}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      currentGrams: e.target.value,
                    })
                  }
                  className="font-mono tabular text-base"
                  placeholder="например, 147"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Заметки</Label>
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
                      Удалить позицию
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Удалить {editForm?.brand} {editForm?.flavor}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Это нельзя отменить. Позиция будет скрыта из справочника и
                        остатков.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction onClick={deleteTobacco}>
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeEdit} disabled={saving}>
                Отмена
              </Button>
              <Button
                onClick={saveEdit}
                disabled={saving || !editForm?.brand || !editForm?.line || !editForm?.flavor}
              >
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
