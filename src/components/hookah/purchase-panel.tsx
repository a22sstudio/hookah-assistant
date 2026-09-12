'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
  Download,
  FileText,
  Send,
  Package,
  Boxes,
  CheckCircle2,
  ShoppingCart,
  MessageSquare,
  ClipboardList,
  Tag,
  Inbox,
} from 'lucide-react'
import { toast } from 'sonner'
import { timeAgo, masterAvatarClass, initials } from '@/lib/master-utils'
import { MasterRequest, REQUEST_STATUS_LABELS } from '@/lib/types'

// ─── Types ──────────────────────────────────────────────────────────
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

type UnifiedItem =
  | { kind: 'request'; data: MasterRequest }
  | { kind: 'order'; data: PurchaseOrder }

type FilterChip = 'all' | 'pending' | 'ordered' | 'received'
type Mode = 'quick' | 'structured'

interface PurchasePanelProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

// ─── Constants ──────────────────────────────────────────────────────
const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  DRAFT: 'border-border text-muted-foreground bg-transparent',
  SUBMITTED: 'border-ember text-ember bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  RECEIVED:
    'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-transparent',
}

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Отправлена',
  ORDERED: 'Заказано',
  RECEIVED: 'Получено',
}

const REQUEST_STATUS_STYLE: Record<MasterRequest['status'], string> = {
  PENDING: 'border-ember text-ember bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  DONE: 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-transparent',
}

const REQUEST_NEXT_STATUS: Record<MasterRequest['status'], MasterRequest['status'] | null> = {
  PENDING: 'ORDERED',
  ORDERED: 'DONE',
  DONE: null,
}

const REQUEST_NEXT_LABEL: Record<MasterRequest['status'], string> = {
  PENDING: 'Заказать',
  ORDERED: 'Получено',
  DONE: '',
}

const FILTER_LABELS: Record<FilterChip, string> = {
  all: 'Все',
  pending: 'Ожидают',
  ordered: 'Заказано',
  received: 'Получено',
}

// ─── Tobacco / consumable row state ──────────────────────────────────
interface TobaccoRow {
  key: string
  brandSelect: string
  newBrand: string
  lineSelect: string
  newLine: string
  flavor: string
  packGrams: string
  quantity: string
  unit: 'банок' | 'пачек'
}

interface ConsumableRow {
  key: string
  consumableId: string
  newName: string
  quantity: string
  unit: 'упаковок' | 'шт'
}

const TOBACCO_UNIT_OPTIONS: Array<'банок' | 'пачек'> = ['банок', 'пачек']
const CONSUMABLE_UNIT_OPTIONS: Array<'упаковок' | 'шт'> = ['упаковок', 'шт']

function makeTobaccoRow(): TobaccoRow {
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

// ─── Helpers ────────────────────────────────────────────────────────
function classifyItem(item: UnifiedItem): Exclude<FilterChip, 'all'> {
  if (item.kind === 'request') {
    if (item.data.status === 'PENDING') return 'pending'
    if (item.data.status === 'ORDERED') return 'ordered'
    return 'received'
  }
  if (item.data.status === 'DRAFT' || item.data.status === 'SUBMITTED') return 'pending'
  if (item.data.status === 'ORDERED') return 'ordered'
  return 'received'
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════
export function PurchasePanel({ role, refreshKey, onRefresh }: PurchasePanelProps) {
  const [items, setItems] = useState<UnifiedItem[]>([])
  const [tobaccos, setTobaccos] = useState<TobaccoRef[]>([])
  const [consumables, setConsumables] = useState<ConsumableRef[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterChip>('all')
  const [mode, setMode] = useState<Mode>('quick')

  // ─── Quick form state (free-text + optional structured mini-form) ──
  const [text, setText] = useState('')
  const [grams, setGrams] = useState('')
  const [submittingQuick, setSubmittingQuick] = useState(false)

  // Optional structured mini-form (within Quick mode)
  const [showStruct, setShowStruct] = useState(false)
  const [brandInput, setBrandInput] = useState<string>('__new__')
  const [newBrand, setNewBrand] = useState('')
  const [flavorId, setFlavorId] = useState<string>('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState<'банок' | 'грамм'>('банок')
  const [note, setNote] = useState('')

  // ─── Structured form state (PurchaseOrder) ──
  const [tobaccoRows, setTobaccoRows] = useState<TobaccoRow[]>([makeTobaccoRow()])
  const [consumableRows, setConsumableRows] = useState<ConsumableRow[]>([])
  const [submittingStruct, setSubmittingStruct] = useState(false)

  // ─── Status update state ──
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  const isSenior = role === 'SENIOR'

  // ─── Load both lists + dictionaries in parallel ──
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const reqUrl = isSenior ? '/api/requests' : '/api/requests?mine=1'
      const [reqRes, ordRes, tRes, cRes] = await Promise.all([
        fetch(reqUrl),
        fetch('/api/orders/compose'),
        fetch('/api/tobaccos'),
        fetch('/api/consumables'),
      ])

      const merged: UnifiedItem[] = []
      if (reqRes.ok) {
        const d = await reqRes.json()
        for (const r of d.requests ?? []) {
          merged.push({ kind: 'request', data: r as MasterRequest })
        }
      }
      if (ordRes.ok) {
        const d = await ordRes.json()
        for (const o of d.orders ?? []) {
          merged.push({ kind: 'order', data: o as PurchaseOrder })
        }
      }
      if (tRes.ok) {
        const d = await tRes.json()
        setTobaccos(d.tobaccos ?? [])
      }
      if (cRes.ok) {
        const d = await cRes.json()
        setConsumables(d.consumables ?? [])
      }

      merged.sort((a, b) => {
        const aTime = new Date(a.data.createdAt).getTime()
        const bTime = new Date(b.data.createdAt).getTime()
        return bTime - aTime
      })
      setItems(merged)
    } catch {
      toast.error('Не удалось загрузить заявки')
    } finally {
      setLoading(false)
    }
  }, [isSenior])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // ─── Brand / flavor options for quick mini-form ──
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const t of tobaccos) set.add(t.brand)
    return Array.from(set).sort()
  }, [tobaccos])

  const flavorOptions = useMemo(() => {
    if (brandInput === '__new__') return []
    return tobaccos.filter((t) => t.brand === brandInput)
  }, [tobaccos, brandInput])

  // ─── Brand / line / flavor cascading for structured form ──
  const linesForBrand = useCallback(
    (brand: string): string[] => {
      if (!brand) return []
      const set = new Set<string>()
      for (const t of tobaccos) {
        if (t.brand === brand && t.line && t.line.trim()) set.add(t.line)
      }
      return Array.from(set).sort()
    },
    [tobaccos],
  )

  const flavorsForBrandLine = useCallback(
    (brand: string, line: string): TobaccoRef[] => {
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

  // ─── Consumable matching for request tags ──
  const findConsumableInText = useCallback(
    (txt: string): ConsumableRef | null => {
      const lower = txt.toLowerCase()
      let found = consumables.find((c) => lower.includes(c.name.toLowerCase()))
      if (!found) {
        found = consumables.find(
          (c) =>
            c.name.length >= 5 &&
            lower.includes(c.name.toLowerCase().slice(0, 5)),
        )
      }
      return found ?? null
    },
    [consumables],
  )

  // ─── Submit: Quick free-text → MasterRequest ──
  const submitQuick = async () => {
    const t = text.trim()
    if (!t) return
    setSubmittingQuick(true)
    try {
      const body: { text: string; grams?: number } = { text: t }
      const g = Number(grams)
      if (grams && Number.isFinite(g) && g > 0) body.grams = g
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success('Заявка отправлена старшему')
      setText('')
      setGrams('')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmittingQuick(false)
    }
  }

  // ─── Submit: Quick structured → MasterRequest ──
  const submitQuickStruct = async () => {
    const brand = brandInput === '__new__' ? newBrand.trim() : brandInput
    if (!brand) {
      toast.error('Выберите бренд или введите новый')
      return
    }
    const qtyNum = Number(qty)
    if (!qtyNum || qtyNum < 1) {
      toast.error('Введите количество')
      return
    }

    let reqText = ''
    let reqGrams: number | undefined
    if (flavorId) {
      const t = tobaccos.find((x) => x.id === flavorId)
      if (t) {
        reqText = `${t.brand} ${t.line} ${t.flavor} — ${qtyNum} ${unit}`
        reqGrams = unit === 'банок' ? t.defaultJarGrams * qtyNum : qtyNum
      }
    } else if (brandInput !== '__new__') {
      reqText = `${brand} — ${qtyNum} ${unit}`
    } else {
      reqText = `${brand} — ${qtyNum} ${unit}`
    }

    if (note.trim()) reqText += ` · ${note.trim()}`

    setSubmittingQuick(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reqText, grams: reqGrams ?? null }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Заявка создана: ${reqText}`)
      setNewBrand('')
      setFlavorId('')
      setQty('1')
      setNote('')
      setBrandInput('__new__')
      setShowStruct(false)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmittingQuick(false)
    }
  }

  // ─── Structured form row handlers ──
  const updateTobaccoRow = (key: string, patch: Partial<TobaccoRow>) => {
    setTobaccoRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const removeTobaccoRow = (key: string) => {
    setTobaccoRows((rows) => (rows.length === 1 ? rows : rows.filter((r) => r.key !== key)))
  }
  const addTobaccoRow = () => setTobaccoRows((rows) => [...rows, makeTobaccoRow()])

  const updateConsumableRow = (key: string, patch: Partial<ConsumableRow>) => {
    setConsumableRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }
  const removeConsumableRow = (key: string) => {
    setConsumableRows((rows) => rows.filter((r) => r.key !== key))
  }
  const addConsumableRow = () =>
    setConsumableRows((rows) => [...rows, makeConsumableRow()])

  // ─── Submit: Structured form → PurchaseOrder ──
  const submitStructured = async () => {
    const payload: Array<{
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
      const brand = row.brandSelect === '__new__' ? row.newBrand.trim() : row.brandSelect
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
      const q = parseInt(row.quantity, 10)
      if (!Number.isFinite(q) || q < 1) {
        toast.error('Количество должно быть положительным')
        return
      }
      const packGrams = parseInt(row.packGrams, 10)
      const t = tobaccos.find(
        (x) =>
          x.brand === brand && (line ? x.line === line : true) && x.flavor === flavor,
      )
      payload.push({
        itemType: 'TOBACCO',
        itemId: t?.id ?? null,
        brand,
        line: line || null,
        flavor,
        name: `${brand} ${line ? line + ' ' : ''}${flavor}`.trim(),
        packGrams: Number.isFinite(packGrams) && packGrams > 0 ? packGrams : null,
        quantity: q,
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
      const q = parseInt(row.quantity, 10)
      if (!Number.isFinite(q) || q < 1) {
        toast.error('Количество должно быть положительным')
        return
      }
      const u =
        row.consumableId === '__new__' || row.consumableId === ''
          ? row.unit
          : (consumables.find((c) => c.id === row.consumableId)?.unit ?? row.unit)
      payload.push({
        itemType: 'CONSUMABLE',
        itemId: row.consumableId && row.consumableId !== '__new__' ? row.consumableId : null,
        brand: null,
        line: null,
        flavor: null,
        name,
        packGrams: null,
        quantity: q,
        unit: u,
      })
    }

    if (payload.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }

    setSubmittingStruct(true)
    try {
      const res = await fetch('/api/orders/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Не удалось создать заявку')
        return
      }
      toast.success(d.message || 'Заявка создана')
      setTobaccoRows([makeTobaccoRow()])
      setConsumableRows([])
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmittingStruct(false)
    }
  }

  // ─── Status change: MasterRequest ──
  const changeRequestStatus = async (id: string, status: MasterRequest['status']) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Статус: ${REQUEST_STATUS_LABELS[status]}`)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Status change: PurchaseOrder ──
  const changeOrderStatus = async (id: string, status: OrderStatus) => {
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
      toast.success(`Статус: ${ORDER_STATUS_LABEL[status]}`)
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

  // ─── Stats ──
  const totalCount = items.length
  const pendingCount = items.filter((i) => classifyItem(i) === 'pending').length
  const receivedCount = items.filter((i) => classifyItem(i) === 'received').length

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((i) => classifyItem(i) === filter)
  }, [items, filter])

  // ════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-3">
        <span className="label-mono flex items-center gap-1.5">
          <ShoppingCart className="h-3 w-3" /> {isSenior ? 'Все заявки на закуп' : 'Мои заявки на закуп'}
        </span>
        <h2
          className="heading-mono text-foreground leading-none mt-1"
          style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
        >
          Закуп
        </h2>
      </div>

      {/* Stats — 3 cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
          <ClipboardList className="h-4 w-4 text-muted-foreground/70" />
          <div>
            <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{totalCount}</p>
            <p className="label-mono mt-1">всего</p>
          </div>
        </div>
        <div
          className={`border rounded-md p-4 flex items-center gap-3 shadow-sm-soft transition-base ${
            pendingCount > 0 ? 'frame-ember' : 'border-border'
          }`}
        >
          <Inbox className={`h-4 w-4 ${pendingCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`} />
          <div>
            <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{pendingCount}</p>
            <p className="label-mono mt-1">ожидают</p>
          </div>
        </div>
        <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground/70" />
          <div>
            <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{receivedCount}</p>
            <p className="label-mono mt-1">получено</p>
          </div>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setMode('quick')}
          className={`px-3 sm:px-4 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border flex items-center gap-1.5 ${
            mode === 'quick'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <MessageSquare className="h-3 w-3" />
          Быстрая заявка
        </button>
        <button
          type="button"
          onClick={() => setMode('structured')}
          className={`px-3 sm:px-4 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors flex items-center gap-1.5 ${
            mode === 'structured'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <ClipboardList className="h-3 w-3" />
          Составить заказ
        </button>
      </div>

      {/* ─── Mode content ─── */}
      {mode === 'quick' ? (
        <div className="frame rounded-md p-4 sm:p-5 space-y-3 shadow-sm-soft">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 label-mono">
              <MessageSquare className="h-3.5 w-3.5" />
              {showStruct ? 'Структурированная заявка' : 'Новая заявка'}
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowStruct((v) => !v)}
              className="h-7 text-[11px]"
            >
              {showStruct ? 'Свободный ввод' : 'Структурированно'}
            </Button>
          </div>

          {showStruct ? (
            <div className="space-y-3">
              {/* Brand */}
              <div className="space-y-1.5">
                <Label>Бренд</Label>
                {brandInput === '__new__' && (
                  <Input
                    placeholder="Новый бренд, например BlackBurn"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                  />
                )}
                <Select
                  value={brandInput}
                  onValueChange={(v) => {
                    setBrandInput(v)
                    setFlavorId('')
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

              {/* Flavor (only if brand selected from existing) */}
              {brandInput !== '__new__' && flavorOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Линейка / вкус</Label>
                  <Select value={flavorId} onValueChange={setFlavorId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Выберите вкус (необязательно)" />
                    </SelectTrigger>
                    <SelectContent>
                      {flavorOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.line} / {t.flavor}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity + unit */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="space-y-1.5">
                  <Label>Количество</Label>
                  <Input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    className="font-mono tabular"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Единица</Label>
                  <Select value={unit} onValueChange={(v: 'банок' | 'грамм') => setUnit(v)}>
                    <SelectTrigger className="w-[110px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="банок">банок</SelectItem>
                      <SelectItem value="грамм">грамм</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Note */}
              <div className="space-y-1.5">
                <Label>Заметка (необязательно)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="например, срочно"
                />
              </div>

              {/* Preview */}
              {(brandInput !== '__new__' ? brandInput : newBrand.trim()) && (
                <div className="border border-border rounded-md p-2.5 bg-muted/40">
                  <p className="label-mono-sm text-muted-foreground mb-1">Превью заявки:</p>
                  <p className="body-sans text-sm text-foreground">
                    {brandInput !== '__new__' && flavorId
                      ? (() => {
                          const t = tobaccos.find((x) => x.id === flavorId)
                          return t
                            ? `${t.brand} ${t.line} ${t.flavor} — ${qty || 0} ${unit}`
                            : `${brandInput} — ${qty || 0} ${unit}`
                        })()
                      : `${brandInput !== '__new__' ? brandInput : newBrand.trim()} — ${qty || 0} ${unit}`}
                    {note.trim() ? ` · ${note.trim()}` : ''}
                  </p>
                </div>
              )}

              <Button
                className="w-full"
                disabled={submittingQuick}
                onClick={submitQuickStruct}
              >
                {submittingQuick ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Отправить старшему
              </Button>
            </div>
          ) : (
            <>
              <Textarea
                placeholder="Что закупить? Например: BlackBurn Energy 2 банки, угли Cocourth 26мм..."
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                disabled={submittingQuick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    void submitQuick()
                  }
                }}
              />
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <div className="space-y-1.5">
                  <Label className="label-mono-sm">Грамм (необязательно)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={grams}
                    onChange={(e) => setGrams(e.target.value)}
                    placeholder="например, 500"
                    className="font-mono tabular"
                  />
                </div>
              </div>
              <Button
                className="w-full"
                disabled={!text.trim() || submittingQuick}
                onClick={submitQuick}
              >
                {submittingQuick ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Отправить старшему
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="frame rounded-md p-4 sm:p-5 space-y-5 shadow-sm-soft">
          <div className="flex items-center gap-2 label-mono">
            <Plus className="h-3.5 w-3.5" />
            Составить структурированный заказ
          </div>

          {/* Section 1: Tobacco */}
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
                    <span className="label-mono-sm text-muted-foreground">Позиция {idx + 1}</span>
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
                      onValueChange={(v) =>
                        updateTobaccoRow(row.key, {
                          brandSelect: v,
                          lineSelect: '',
                          newLine: '',
                        })
                      }
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

                  {/* Line */}
                  {row.brandSelect !== '' &&
                    row.brandSelect !== '__new__' &&
                    linesForBrand(row.brandSelect).length > 0 && (
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

                  {/* Flavor */}
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

                  {/* pack grams + qty + unit */}
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

          {/* Section 2: Consumables */}
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
                    <span className="label-mono-sm text-muted-foreground">Расходник {idx + 1}</span>
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
                        onValueChange={(v: 'упаковок' | 'шт') =>
                          updateConsumableRow(row.key, { unit: v })
                        }
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
              <p className="label-mono-sm text-muted-foreground mb-2">Превью заказа:</p>
              <div className="space-y-1">
                {tobaccoRows.map((row) => {
                  const brand = row.brandSelect === '__new__' ? row.newBrand.trim() : row.brandSelect
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
          <Button className="w-full" disabled={submittingStruct} onClick={submitStructured}>
            {submittingStruct ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Создать заявку
          </Button>
        </div>
      )}

      {/* ─── Unified list ─── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="label-mono">Существующие заявки</span>
          {/* Filter chips */}
          <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
            {(['all', 'pending', 'ordered', 'received'] as FilterChip[]).map((f, idx) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
                  idx < 3 ? 'border-r border-border' : ''
                } ${
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>

        <div className="border border-border rounded-md shadow-sm-soft">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm body-sans">
              {filter === 'pending'
                ? 'Нет ожидающих заявок.'
                : filter === 'ordered'
                  ? 'Нет заказанных заявок.'
                  : filter === 'received'
                    ? 'Нет полученных заявок.'
                    : 'Заявок пока нет.'}
            </div>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <div className="stagger-children">
                {filteredItems.map((item) =>
                  item.kind === 'request' ? (
                    <RequestCard
                      key={`r-${item.data.id}`}
                      request={item.data}
                      isSenior={isSenior}
                      updatingId={updatingId}
                      onChangeStatus={changeRequestStatus}
                      findConsumableInText={findConsumableInText}
                    />
                  ) : (
                    <OrderCard
                      key={`o-${item.data.id}`}
                      order={item.data}
                      isSenior={isSenior}
                      updatingId={updatingId}
                      onChangeStatus={changeOrderStatus}
                      onDelete={deleteOrder}
                      onExport={exportOrder}
                    />
                  ),
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// REQUEST CARD (MasterRequest — free-text)
// ════════════════════════════════════════════════════════════════════
function RequestCard({
  request,
  isSenior,
  updatingId,
  onChangeStatus,
  findConsumableInText,
}: {
  request: MasterRequest
  isSenior: boolean
  updatingId: string | null
  onChangeStatus: (id: string, status: MasterRequest['status']) => void
  findConsumableInText: (text: string) => ConsumableRef | null
}) {
  const next = REQUEST_NEXT_STATUS[request.status]
  const matchedConsumable = findConsumableInText(request.text)

  return (
    <div className="p-4 border-b border-border last:border-b-0 space-y-2">
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </div>
        {/* Master avatar — only for senior */}
        {isSenior && (
          <div
            className={`mt-0.5 h-9 w-9 shrink-0 ${masterAvatarClass(
              request.master.color,
            )} flex items-center justify-center text-[10px] font-mono font-bold text-white rounded-md`}
          >
            {initials(request.master.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          {isSenior && (
            <div className="label-mono-sm mb-1">
              {request.master.name}
              {request.isMine && <span className="ml-1.5 text-ember">· ты</span>}
            </div>
          )}
          <p className="body-sans text-sm break-words">{request.text}</p>
          {matchedConsumable && (
            <div className="mt-1.5 inline-flex items-center gap-1 border border-border rounded-sm px-1.5 py-0.5 bg-muted/50">
              <Tag className="h-2.5 w-2.5 text-muted-foreground" />
              <span className="label-mono-sm text-muted-foreground">{matchedConsumable.name}</span>
            </div>
          )}
          {request.grams != null && (
            <p className="label-mono-sm mt-1">
              Нужно: <span className="text-foreground font-bold">{request.grams}г</span>
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className={REQUEST_STATUS_STYLE[request.status]}>
              {REQUEST_STATUS_LABELS[request.status]}
            </Badge>
            <span className="label-mono-sm">{timeAgo(request.createdAt)}</span>
          </div>
        </div>
      </div>

      {isSenior && next && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] ml-12"
          disabled={updatingId === request.id}
          onClick={() => onChangeStatus(request.id, next)}
        >
          {updatingId === request.id ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <ShoppingCart className="h-3 w-3" />
          )}
          {REQUEST_NEXT_LABEL[request.status]}
        </Button>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════
// ORDER CARD (PurchaseOrder — structured)
// ════════════════════════════════════════════════════════════════════
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

  return (
    <div className="p-4 border-b border-border last:border-b-0 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Type icon */}
        <div className="mt-0.5 h-9 w-9 shrink-0 rounded-md border border-border bg-muted/40 flex items-center justify-center">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={ORDER_STATUS_STYLE[order.status]}>
              {ORDER_STATUS_LABEL[order.status]}
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
      </div>

      {/* Items preview */}
      <div className="space-y-1 pl-12">
        {tobaccoItems.length > 0 && (
          <div>
            <p className="label-mono-sm text-muted-foreground mb-1">Табак:</p>
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
            <p className="label-mono-sm text-muted-foreground mb-1">Расходники:</p>
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

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap pl-12">
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
  )
}
