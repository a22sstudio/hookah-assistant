'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Plus,
  Trash2,
  Loader2,
  ClipboardList,
  Download,
  FileText,
  Send,
  Package,
  Boxes,
  CheckCircle2,
  ShoppingCart,
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo } from '@/lib/master-utils'

type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'ORDERED' | 'RECEIVED'

interface OrderItem {
  id: string
  itemType: 'TOBACCO' | 'CONSUMABLE'
  itemId?: string | null
  brand?: string | null
  line?: string | null
  flavor?: string | null
  name: string
  packGrams?: number | null
  quantity: number
  unit: string
}

interface PurchaseOrder {
  id: string
  status: OrderStatus
  createdAt: string
  updatedAt: string
  items: OrderItem[]
}

interface TobaccoRef {
  id: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: number
}

interface ConsumableRef {
  id: string
  name: string
  unit: string
}

interface OrderComposerProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  DRAFT: 'border-border text-muted-foreground bg-transparent',
  SUBMITTED: 'border-ember text-ember bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  RECEIVED: 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-transparent',
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлена',
  ORDERED: 'Заказано',
  RECEIVED: 'Получено',
}

// ─── Tobacco form row state ─────────────────────────────────────
interface TobaccoRow {
  key: string
  brandSelect: string // '' | brand name | '__new__'
  newBrand: string
  lineSelect: string // '' | line name | '__new__' | '__none__'
  newLine: string
  flavor: string
  packGrams: string
  quantity: string
  unit: 'банок' | 'пачек'
}

interface ConsumableRow {
  key: string
  consumableId: string // '' | existing id | '__new__'
  newName: string
  quantity: string
  unit: 'упаковок' | 'шт'
}

const TOBACCO_UNIT_OPTIONS: Array<'банок' | 'пачек'> = ['банок', 'пачек']
const CONSUMABLE_UNIT_OPTIONS: Array<'упаковок' | 'шт'> = ['упаковок', 'шт']

function makeRow(): TobaccoRow {
  return {
    key: Math.random().toString(36).slice(2),
    brandSelect: '',
    newBrand: '',
    lineSelect: '',
    newLine: '',
    flavor: '',
    packGrams: '250',
    quantity: '1',
    unit: 'банок',
  }
}

function makeConsumableRow(): ConsumableRow {
  return {
    key: Math.random().toString(36).slice(2),
    consumableId: '',
    newName: '',
    quantity: '1',
    unit: 'упаковок',
  }
}

export function OrderComposer({ role, refreshKey, onRefresh }: OrderComposerProps) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [tobaccos, setTobaccos] = useState<TobaccoRef[]>([])
  const [consumables, setConsumables] = useState<ConsumableRef[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const [tobaccoRows, setTobaccoRows] = useState<TobaccoRow[]>([makeRow()])
  const [consumableRows, setConsumableRows] = useState<ConsumableRow[]>([])

  const isSenior = role === 'SENIOR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ordersRes, tobaccosRes, consumablesRes] = await Promise.all([
        fetch('/api/orders/compose'),
        fetch('/api/tobaccos'),
        fetch('/api/consumables'),
      ])
      if (ordersRes.ok) {
        const d = await ordersRes.json()
        setOrders(d.orders ?? [])
      }
      if (tobaccosRes.ok) {
        const d = await tobaccosRes.json()
        setTobaccos(d.tobaccos ?? [])
      }
      if (consumablesRes.ok) {
        const d = await consumablesRes.json()
        setConsumables(d.consumables ?? [])
      }
    } catch {
      toast.error('Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Список брендов из существующих табаков
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const t of tobaccos) set.add(t.brand)
    return Array.from(set).sort()
  }, [tobaccos])

  // Линейки по бренду
  const linesForBrand = useCallback(
    (brand: string) => {
      if (!brand) return []
      const set = new Set<string>()
      for (const t of tobaccos) {
        if (t.brand === brand && t.line && t.line.trim()) set.add(t.line)
      }
      return Array.from(set).sort()
    },
    [tobaccos],
  )

  // Вкусы по бренду+линейке
  const flavorsForBrandLine = useCallback(
    (brand: string, line: string) => {
      if (!brand) return []
      return tobaccos.filter((t) => {
        if (t.brand !== brand) return false
        if (line === '__none__') return !t.line || t.line.trim() === ''
        if (line === '__new__') return false
        if (!line) return true
        return t.line === line
      })
    },
    [tobaccos],
  )

  const updateTobaccoRow = (key: string, patch: Partial<TobaccoRow>) => {
    setTobaccoRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const removeTobaccoRow = (key: string) => {
    setTobaccoRows((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)))
  }
  const addTobaccoRow = () => setTobaccoRows((rows) => [...rows, makeRow()])

  const updateConsumableRow = (key: string, patch: Partial<ConsumableRow>) => {
    setConsumableRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const removeConsumableRow = (key: string) => {
    setConsumableRows((rows) => rows.filter((r) => r.key !== key))
  }
  const addConsumableRow = () =>
    setConsumableRows((rows) => [...rows, makeConsumableRow()])

  // ─── Submit ─────────────────────────────────────────────────
  const submit = async () => {
    const items: Array<{
      itemType: string
      itemId: string | null
      brand: string | null
      line: string | null
      flavor: string | null
      name: string
      packGrams: number | null
      quantity: number
      unit: string
    }> = []

    for (const row of tobaccoRows) {
      const brand =
        row.brandSelect === '__new__' ? row.newBrand.trim() : row.brandSelect
      if (!brand) {
        toast.error('Заполните бренд во всех позициях табака')
        return
      }
      const flavor = row.flavor.trim()
      if (!flavor) {
        toast.error('Заполните вкус во всех позициях табака')
        return
      }
      const line =
        row.brandSelect === '__new__'
          ? row.newLine.trim()
          : row.lineSelect === '__new__'
            ? row.newLine.trim()
            : row.lineSelect === '__none__' || !row.lineSelect
              ? ''
              : row.lineSelect
      const qty = parseInt(row.quantity, 10)
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error('Количество должно быть положительным')
        return
      }
      const packGrams = parseInt(row.packGrams, 10)
      const items_ = tobaccos.find(
        (t) =>
          t.brand === brand &&
          (line ? t.line === line : true) &&
          t.flavor === flavor,
      )
      items.push({
        itemType: 'TOBACCO',
        itemId: items_?.id ?? null,
        brand,
        line: line || null,
        flavor,
        name: `${brand} ${line ? line + ' ' : ''}${flavor}`.trim(),
        packGrams: Number.isFinite(packGrams) && packGrams > 0 ? packGrams : null,
        quantity: qty,
        unit: row.unit,
      })
    }

    for (const row of consumableRows) {
      const name =
        row.consumableId === '__new__'
          ? row.newName.trim()
          : (consumables.find((c) => c.id === row.consumableId)?.name ?? '')
      if (!name) {
        toast.error('Заполните наименование во всех расходниках')
        return
      }
      const qty = parseInt(row.quantity, 10)
      if (!Number.isFinite(qty) || qty < 1) {
        toast.error('Количество должно быть положительным')
        return
      }
      const unit =
        row.consumableId === '__new__' || row.consumableId === ''
          ? row.unit
          : (consumables.find((c) => c.id === row.consumableId)?.unit ?? row.unit)
      items.push({
        itemType: 'CONSUMABLE',
        itemId: row.consumableId && row.consumableId !== '__new__' ? row.consumableId : null,
        brand: null,
        line: null,
        flavor: null,
        name,
        packGrams: null,
        quantity: qty,
        unit,
      })
    }

    if (items.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/orders/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось создать заявку')
        return
      }
      toast.success(d.message || 'Заявка создана')
      // Сброс
      setTobaccoRows([makeRow()])
      setConsumableRows([])
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmitting(false)
    }
  }

  const changeStatus = async (id: string, status: OrderStatus) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/orders/compose', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось обновить статус')
        return
      }
      toast.success(`Статус: ${STATUS_LABEL[status]}`)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  const deleteOrder = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/compose?id=${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось удалить')
        return
      }
      toast.success(d.message || 'Удалено')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    }
  }

  const exportOrder = async (id: string, format: 'csv' | 'pdf') => {
    try {
      const res = await fetch(`/api/orders/export?id=${id}&format=${format}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Не удалось выгрузить')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `order.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Экспорт ${format.toUpperCase()}`)
    } catch {
      toast.error('Ошибка соединения')
    }
  }

  // Сводка
  const draftCount = orders.filter((o) => o.status === 'DRAFT').length
  const submittedCount = orders.filter((o) => o.status === 'SUBMITTED').length
  const orderedCount = orders.filter((o) => o.status === 'ORDERED').length
  const receivedCount = orders.filter((o) => o.status === 'RECEIVED').length

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div>
          <span className="label-mono flex items-center gap-1.5">
            <ClipboardList className="h-3 w-3" /> Структурированные заявки
          </span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Заказ на закуп
          </h2>
        </div>
      </div>

      {/* Сводка */}
      {orders.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className={`border rounded-md p-4 flex items-center gap-3 shadow-sm-soft ${draftCount > 0 ? 'frame-ember' : 'border-border'}`}>
            <Package className={`h-4 w-4 ${draftCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`} />
            <div>
              <p className="font-mono font-bold leading-none tabular text-foreground text-2xl">{draftCount}</p>
              <p className="label-mono mt-1">черновики</p>
            </div>
          </div>
          <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
            <Send className="h-4 w-4 text-muted-foreground/70" />
            <div>
              <p className="font-mono font-bold leading-none tabular text-foreground text-2xl">{submittedCount}</p>
              <p className="label-mono mt-1">отправлены</p>
            </div>
          </div>
          <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
            <ShoppingCart className="h-4 w-4 text-muted-foreground/70" />
            <div>
              <p className="font-mono font-bold leading-none tabular text-foreground text-2xl">{orderedCount}</p>
              <p className="label-mono mt-1">заказаны</p>
            </div>
          </div>
          <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground/70" />
            <div>
              <p className="font-mono font-bold leading-none tabular text-foreground text-2xl">{receivedCount}</p>
              <p className="label-mono mt-1">получены</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Форма составления ─── */}
      <div className="frame rounded-md p-4 sm:p-5 space-y-5 shadow-sm-soft">
        <div className="flex items-center gap-2 label-mono">
          <Plus className="h-3.5 w-3.5" />
          Новая заявка
        </div>

        {/* Секция 1: Табак */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 label-mono">
              <Package className="h-3.5 w-3.5" />
              Табак
            </div>
            <Button size="sm" variant="outline" onClick={addTobaccoRow} className="h-7 text-[11px]">
              <Plus className="h-3 w-3" /> Добавить табак
            </Button>
          </div>

          <div className="space-y-3">
            {tobaccoRows.map((row, idx) => (
              <div
                key={row.key}
                className="border border-border rounded-md p-3 space-y-2 bg-muted/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="label-mono-sm text-muted-foreground">
                    Позиция {idx + 1}
                  </span>
                  {tobaccoRows.length > 1 && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => removeTobaccoRow(row.key)}
                      title="Удалить"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Brand */}
                <div className="space-y-1.5">
                  <Label className="label-mono-sm">Бренд</Label>
                  {row.brandSelect === '__new__' && (
                    <Input
                      placeholder="Новый бренд, например BlackBurn"
                      value={row.newBrand}
                      onChange={(e) => updateTobaccoRow(row.key, { newBrand: e.target.value })}
                    />
                  )}
                  <Select
                    value={row.brandSelect}
                    onValueChange={(v) => {
                      updateTobaccoRow(row.key, {
                        brandSelect: v,
                        lineSelect: '',
                        newLine: '',
                      })
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите бренд" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">— новый бренд —</SelectItem>
                      {brands.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Line — только если бренд выбран из существующих */}
                {row.brandSelect !== '' && row.brandSelect !== '__new__' && linesForBrand(row.brandSelect).length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Линейка</Label>
                    {row.lineSelect === '__new__' && (
                      <Input
                        placeholder="Новая линейка"
                        value={row.newLine}
                        onChange={(e) => updateTobaccoRow(row.key, { newLine: e.target.value })}
                      />
                    )}
                    <Select
                      value={row.lineSelect}
                      onValueChange={(v) => updateTobaccoRow(row.key, { lineSelect: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Выберите линейку (необязательно)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— без линейки —</SelectItem>
                        {linesForBrand(row.brandSelect).map((l) => (
                          <SelectItem key={l} value={l}>
                            {l}
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__">— новая линейка —</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Flavor — инпут с датalist подсказок */}
                <div className="space-y-1.5">
                  <Label className="label-mono-sm">Вкус *</Label>
                  <Input
                    list={`flavors-${row.key}`}
                    placeholder="Cola, Ice Grape, ..."
                    value={row.flavor}
                    onChange={(e) => updateTobaccoRow(row.key, { flavor: e.target.value })}
                  />
                  <datalist id={`flavors-${row.key}`}>
                    {flavorsForBrandLine(row.brandSelect, row.lineSelect).map((t) => (
                      <option key={t.id} value={t.flavor} />
                    ))}
                  </datalist>
                </div>

                {/* Pack grams + quantity + unit */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Грамм/банка</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.packGrams}
                      onChange={(e) => updateTobaccoRow(row.key, { packGrams: e.target.value })}
                      className="font-mono tabular"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Кол-во</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateTobaccoRow(row.key, { quantity: e.target.value })}
                      className="font-mono tabular"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Ед.</Label>
                    <Select
                      value={row.unit}
                      onValueChange={(v: 'банок' | 'пачек') => updateTobaccoRow(row.key, { unit: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TOBACCO_UNIT_OPTIONS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Секция 2: Расходники */}
        <div className="space-y-3 pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 label-mono">
              <Boxes className="h-3.5 w-3.5" />
              Расходники
            </div>
            <Button size="sm" variant="outline" onClick={addConsumableRow} className="h-7 text-[11px]">
              <Plus className="h-3 w-3" /> Добавить расходник
            </Button>
          </div>

          <div className="space-y-3">
            {consumableRows.map((row, idx) => (
              <div
                key={row.key}
                className="border border-border rounded-md p-3 space-y-2 bg-muted/30"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="label-mono-sm text-muted-foreground">
                    Расходник {idx + 1}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => removeConsumableRow(row.key)}
                    title="Удалить"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* consumable select / new name */}
                <div className="space-y-1.5">
                  <Label className="label-mono-sm">Расходник</Label>
                  {row.consumableId === '__new__' && (
                    <Input
                      placeholder="Наименование, например Угли Cocourth 26мм"
                      value={row.newName}
                      onChange={(e) => updateConsumableRow(row.key, { newName: e.target.value })}
                    />
                  )}
                  <Select
                    value={row.consumableId}
                    onValueChange={(v) => updateConsumableRow(row.key, { consumableId: v })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите или добавьте новый" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__new__">— новый расходник —</SelectItem>
                      {consumables.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Кол-во</Label>
                    <Input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => updateConsumableRow(row.key, { quantity: e.target.value })}
                      className="font-mono tabular"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="label-mono-sm">Ед.</Label>
                    <Select
                      value={row.unit}
                      onValueChange={(v: 'упаковок' | 'шт') => updateConsumableRow(row.key, { unit: v })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONSUMABLE_UNIT_OPTIONS.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
            {consumableRows.length === 0 && (
              <p className="body-sans text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
                Расходники не добавлены
              </p>
            )}
          </div>
        </div>

        {/* Live preview */}
        {(tobaccoRows.length > 0 || consumableRows.length > 0) && (
          <div className="border border-border rounded-md p-3 bg-muted/40">
            <p className="label-mono-sm text-muted-foreground mb-2">
              Превью заявки:
            </p>
            <div className="space-y-1">
              {tobaccoRows.map((row) => {
                const brand =
                  row.brandSelect === '__new__' ? row.newBrand.trim() : row.brandSelect
                const line =
                  row.brandSelect === '__new__'
                    ? row.newLine.trim()
                    : row.lineSelect === '__new__'
                      ? row.newLine.trim()
                      : row.lineSelect === '__none__' || !row.lineSelect
                        ? ''
                        : row.lineSelect
                const name = `${brand}${line ? ' ' + line : ''}${row.flavor ? ' ' + row.flavor : ''}`.trim()
                return (
                  <p key={row.key} className="body-sans text-sm text-foreground">
                    • {name || '...'} — {row.quantity} {row.unit}
                  </p>
                )
              })}
              {consumableRows.map((row) => {
                const name =
                  row.consumableId === '__new__'
                    ? row.newName.trim()
                    : (consumables.find((c) => c.id === row.consumableId)?.name ?? '')
                return (
                  <p key={row.key} className="body-sans text-sm text-foreground">
                    • {name || '...'} — {row.quantity} {row.unit}
                  </p>
                )
              })}
            </div>
          </div>
        )}

        {/* Submit */}
        <Button className="w-full" disabled={submitting} onClick={submit}>
          {submitting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Создать заявку
        </Button>
      </div>

      {/* ─── Список существующих заявок ─── */}
      <div className="border border-border rounded-md shadow-sm-soft">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <span className="label-mono">Существующие заявки</span>
          <span className="label-mono-sm text-muted-foreground">
            Всего: {orders.length}
          </span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Заявок пока нет. Создайте первую выше.
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {orders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  isSenior={isSenior}
                  updatingId={updatingId}
                  onChangeStatus={changeStatus}
                  onDelete={deleteOrder}
                  onExport={exportOrder}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

function OrderCard({
  order,
  isSenior,
  updatingId,
  onChangeStatus,
  onDelete,
  onExport,
}: {
  order: PurchaseOrder
  isSenior: boolean
  updatingId: string | null
  onChangeStatus: (id: string, status: OrderStatus) => void
  onDelete: (id: string) => void
  onExport: (id: string, format: 'csv' | 'pdf') => void
}) {
  const tobaccoItems = order.items.filter((i) => i.itemType === 'TOBACCO')
  const consumableItems = order.items.filter((i) => i.itemType === 'CONSUMABLE')

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })

  return (
    <div className="p-4 border-b border-border last:border-b-0 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={STATUS_STYLE[order.status]}>
              {STATUS_LABEL[order.status]}
            </Badge>
            <span className="label-mono-sm text-muted-foreground">
              {formatDate(order.createdAt)} · {timeAgo(order.createdAt)}
            </span>
          </div>
          <p className="body-sans text-sm font-bold tracking-tight text-foreground mt-1">
            {order.items.length} поз.
            {tobaccoItems.length > 0 && (
              <span className="text-muted-foreground"> · табак: {tobaccoItems.length}</span>
            )}
            {consumableItems.length > 0 && (
              <span className="text-muted-foreground"> · расход: {consumableItems.length}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {isSenior && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => onExport(order.id, 'csv')}
                title="Экспорт CSV"
              >
                <Download className="h-3 w-3" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => onExport(order.id, 'pdf')}
                title="Экспорт PDF"
              >
                <FileText className="h-3 w-3" /> PDF
              </Button>
            </>
          )}
          {order.status === 'DRAFT' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] frame-ember"
              disabled={updatingId === order.id}
              onClick={() => onChangeStatus(order.id, 'SUBMITTED')}
            >
              {updatingId === order.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
              Отправить
            </Button>
          )}
          {isSenior && order.status === 'SUBMITTED' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={updatingId === order.id}
              onClick={() => onChangeStatus(order.id, 'ORDERED')}
            >
              {updatingId === order.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ShoppingCart className="h-3 w-3" />
              )}
              Заказать
            </Button>
          )}
          {isSenior && order.status === 'ORDERED' && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={updatingId === order.id}
              onClick={() => onChangeStatus(order.id, 'RECEIVED')}
            >
              {updatingId === order.id ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3 w-3" />
              )}
              Получено
            </Button>
          )}
          {isSenior && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title="Удалить"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Удалить заявку?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Действие необратимо. Заявка и все позиции будут удалены.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => onDelete(order.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Удалить
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Items preview */}
      <div className="space-y-1 pl-1">
        {tobaccoItems.length > 0 && (
          <div>
            <p className="label-mono-sm text-muted-foreground mb-1">
              Табак:
            </p>
            <div className="space-y-0.5">
              {tobaccoItems.map((it) => (
                <p key={it.id} className="body-sans text-sm text-foreground">
                  • {it.name}
                  {it.packGrams ? ` (${it.packGrams}г)` : ''} — {it.quantity} {it.unit}
                </p>
              ))}
            </div>
          </div>
        )}
        {consumableItems.length > 0 && (
          <div>
            <p className="label-mono-sm text-muted-foreground mb-1">
              Расходники:
            </p>
            <div className="space-y-0.5">
              {consumableItems.map((it) => (
                <p key={it.id} className="body-sans text-sm text-foreground">
                  • {it.name} — {it.quantity} {it.unit}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
