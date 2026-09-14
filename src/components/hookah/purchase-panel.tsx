'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MasterRequest, REQUEST_STATUS_LABELS } from '@/lib/types'
import { masterAvatarClass, timeAgo, initials } from '@/lib/master-utils'
import {
  Send,
  Loader2,
  Inbox,
  ShoppingCart,
  CheckCircle2,
  Package,
  Plus,
  X,
  Download,
  Trash2,
  GitMerge,
  Flame,
  Layers,
  AlertTriangle,
  Pencil,
  Save,
} from 'lucide-react'
import { toast } from 'sonner'

interface PurchaseOrderItem {
  id: string
  itemType: string
  itemId: string | null
  brand: string | null
  line: string | null
  flavor: string | null
  name: string
  packGrams: number | null
  quantity: number
  unit: string
}

interface PurchaseOrder {
  id: string
  status: string
  isMerged: boolean
  createdAt: string
  updatedAt: string
  itemsCount: number
  items: PurchaseOrderItem[]
}

interface Tobacco {
  id: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: number
  thresholdGrams: number
  currentGrams: number
  isLow: boolean
}

interface Consumable {
  id: string
  name: string
  unit: string
  currentQty: number
  threshold: number
  isLow: boolean
}

interface PurchasePanelProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

type FilterChip = 'all' | 'pending' | 'ordered' | 'received'

const STATUS_STYLE_REQ: Record<MasterRequest['status'], string> = {
  PENDING: 'border-ember text-ember bg-transparent',
  ORDERED: 'border-foreground text-foreground bg-transparent',
  DONE: 'border-border text-muted-foreground bg-transparent',
}

const NEXT_STATUS: Record<MasterRequest['status'], MasterRequest['status'] | null> = {
  PENDING: 'ORDERED',
  ORDERED: 'DONE',
  DONE: null,
}

const NEXT_LABEL: Record<MasterRequest['status'], string> = {
  PENDING: 'Заказать',
  ORDERED: 'Получено',
  DONE: '',
}

const PURCHASE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Черновик',
  SUBMITTED: 'Ожидает',
  ORDERED: 'Заказано',
  RECEIVED: 'Получено',
  MERGED: 'Объединён',
}

const PURCHASE_NEXT_STATUS: Record<string, string | null> = {
  DRAFT: 'SUBMITTED',
  SUBMITTED: 'ORDERED',
  ORDERED: 'RECEIVED',
  RECEIVED: null,
  MERGED: null,
}

const PURCHASE_NEXT_LABEL: Record<string, string> = {
  DRAFT: 'Отправить',
  SUBMITTED: 'Заказать',
  ORDERED: 'Получено',
  RECEIVED: '',
  MERGED: '',
}

type ListItem =
  | {
      kind: 'request'
      id: string
      createdAt: string
      status: string
      content: string
      master?: { name: string; color: string }
      isMine: boolean
      data: MasterRequest
    }
  | {
      kind: 'order'
      id: string
      createdAt: string
      status: string
      isMerged: boolean
      content: string
      data: PurchaseOrder
    }

interface DraftItem {
  key: string
  itemType: 'TOBACCO' | 'CONSUMABLE'
  brand?: string
  line?: string
  flavor?: string
  name: string
  packGrams?: number
  quantity: number
  unit: string
  itemId?: string
}

let DRAFT_SEQ = 0

export function PurchasePanel({ role, refreshKey, onRefresh }: PurchasePanelProps) {
  const isSenior = role === 'SENIOR'

  const [requests, setRequests] = useState<MasterRequest[]>([])
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterChip>('all')

  // Свободный текст
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Структурированная форма (inline)
  const [showStructured, setShowStructured] = useState(false)
  const [brandInput, setBrandInput] = useState<string>('__new__')
  const [newBrand, setNewBrand] = useState('')
  const [flavorId, setFlavorId] = useState<string>('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState<'банок' | 'грамм'>('банок')
  const [note, setNote] = useState('')
  const [submittingStruct, setSubmittingStruct] = useState(false)

  // Диалог "Заказать всё мало"
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkItems, setBulkItems] = useState<DraftItem[]>([])
  const [bulkSaving, setBulkSaving] = useState(false)

  // Структурированное добавление в bulk-диалог
  const [bulkAddBrand, setBulkAddBrand] = useState<string>('')
  const [bulkAddLine, setBulkAddLine] = useState<string>('')
  const [bulkAddFlavor, setBulkAddFlavor] = useState<string>('')
  const [bulkAddQty, setBulkAddQty] = useState('1')
  const [bulkAddUnit, setBulkAddUnit] = useState('банок')

  // Выбор заказов для объединения
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState(false)

  // Диалог редактирования заказа
  const [editOrder, setEditOrder] = useState<PurchaseOrder | null>(null)
  const [editItems, setEditItems] = useState<Array<{
    id?: string
    itemType: string
    name: string
    brand?: string | null
    line?: string | null
    flavor?: string | null
    packGrams?: number | null
    quantity: number
    unit: string
  }>>([])
  const [editSaving, setEditSaving] = useState(false)

  const openEditOrder = (order: PurchaseOrder) => {
    setEditOrder(order)
    setEditItems(order.items.map((it) => ({
      id: it.id,
      itemType: it.itemType,
      name: it.name,
      brand: it.brand,
      line: it.line,
      flavor: it.flavor,
      packGrams: it.packGrams,
      quantity: it.quantity,
      unit: it.unit,
    })))
  }

  const updateEditItem = (idx: number, field: string, value: string | number) => {
    setEditItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it))
  }

  const removeEditItem = (idx: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== idx))
  }

  const addEditItem = () => {
    setEditItems((prev) => [...prev, {
      itemType: 'TOBACCO',
      name: '',
      brand: null,
      line: null,
      flavor: null,
      packGrams: null,
      quantity: 1,
      unit: 'банок',
    }])
  }

  const saveEditOrder = async () => {
    if (!editOrder) return
    // Валидация
    for (const it of editItems) {
      if (!it.name.trim()) {
        toast.error('Заполните наименование всех позиций')
        return
      }
      if (!it.quantity || it.quantity < 1) {
        toast.error('Количество должно быть положительным')
        return
      }
    }
    setEditSaving(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editOrder.id,
          items: editItems.map((it) => ({
            itemType: it.itemType,
            name: it.name.trim(),
            brand: it.brand || null,
            line: it.line || null,
            flavor: it.flavor || null,
            packGrams: it.packGrams || null,
            quantity: Number(it.quantity),
            unit: it.unit,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка сохранения')
        return
      }
      toast.success('Заказ обновлён')
      setEditOrder(null)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setEditSaving(false)
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = isSenior ? '/api/requests' : '/api/requests?mine=1'
      const [reqRes, ordRes, tobRes, conRes] = await Promise.all([
        fetch(url),
        isSenior ? fetch('/api/purchase-orders') : Promise.resolve(null),
        fetch('/api/tobaccos'),
        isSenior ? fetch('/api/consumables') : Promise.resolve(null),
      ])
      const reqData = await reqRes.json()
      setRequests(reqData.requests ?? [])
      if (ordRes) {
        const ordData = await ordRes.json()
        setOrders(ordData.orders ?? [])
      }
      const tobData = await tobRes.json()
      setTobaccos(tobData.tobaccos ?? [])
      if (conRes) {
        const conData = await conRes.json()
        setConsumables(conData.consumables ?? [])
      }
    } catch {
      toast.error('Не удалось загрузить')
    } finally {
      setLoading(false)
    }
  }, [isSenior])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Список уникальных брендов из существующих табаков
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const t of tobaccos) set.add(t.brand)
    return Array.from(set).sort()
  }, [tobaccos])

  const flavorOptions = useMemo(() => {
    if (brandInput === '__new__') return []
    return tobaccos.filter((t) => t.brand === brandInput)
  }, [tobaccos, brandInput])

  // Низкие по табаку / расходникам
  const lowTobaccos = useMemo(() => tobaccos.filter((t) => t.isLow), [tobaccos])
  const lowConsumables = useMemo(() => consumables.filter((c) => c.isLow), [consumables])

  // Объединённый список для отображения
  const allItems: ListItem[] = useMemo(() => {
    const reqs: ListItem[] = requests.map((r) => ({
      kind: 'request' as const,
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      content: r.text,
      master: { name: r.master.name, color: r.master.color },
      isMine: r.isMine,
      data: r,
    }))
    if (!isSenior) return reqs
    const ords: ListItem[] = orders.map((o) => ({
      kind: 'order' as const,
      id: o.id,
      createdAt: o.createdAt,
      status: o.status,
      isMerged: o.isMerged,
      content: o.items.map((it) => formatItemName(it)).join('; '),
      data: o,
    }))
    // Сортировка по дате убывание
    return [...reqs, ...ords].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [requests, orders, isSenior])

  const filteredItems = useMemo(() => {
    if (filter === 'all') return allItems
    if (filter === 'pending') return allItems.filter((i) => i.status === 'PENDING' || i.status === 'SUBMITTED' || i.status === 'DRAFT')
    if (filter === 'ordered') return allItems.filter((i) => i.status === 'ORDERED')
    if (filter === 'received') return allItems.filter((i) => i.status === 'DONE' || i.status === 'RECEIVED')
    return allItems
  }, [allItems, filter])

  // ─── Создание свободной заявки ───
  const submitText = async () => {
    const t = text.trim()
    if (!t) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success('Заявка отправлена старшему')
      setText('')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Создание структурированной заявки ───
  const submitStructured = async () => {
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

    let requestText = ''
    let grams: number | undefined
    if (flavorId) {
      const t = tobaccos.find((x) => x.id === flavorId)
      if (t) {
        requestText = `${t.brand} ${t.line} ${t.flavor} — ${qtyNum} ${unit}`
        if (unit === 'банок') grams = t.defaultJarGrams * qtyNum
        else grams = qtyNum
      }
    } else if (brandInput !== '__new__') {
      requestText = `${brand} — ${qtyNum} ${unit}`
    } else {
      requestText = `${brand} — ${qtyNum} ${unit}`
    }

    if (note.trim()) {
      requestText += ` · ${note.trim()}`
    }

    setSubmittingStruct(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: requestText, grams: grams ?? null }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Заявка создана: ${requestText}`)
      setNewBrand('')
      setFlavorId('')
      setQty('1')
      setNote('')
      setBrandInput('__new__')
      setShowStructured(false)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setSubmittingStruct(false)
    }
  }

  // ─── Смена статуса MasterRequest ───
  const changeStatus = async (id: string, status: MasterRequest['status']) => {
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

  // ─── Смена статуса PurchaseOrder ───
  const changeOrderStatus = async (id: string, status: string) => {
    setUpdatingId(id)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Статус: ${PURCHASE_STATUS_LABELS[status] ?? status}`)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Удаление PurchaseOrder ───
  const deleteOrder = async (id: string) => {
    if (!confirm('Удалить заказ безвозвратно?')) return
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/purchase-orders?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Ошибка удаления')
        return
      }
      toast.success('Заказ удалён')
      setSelectedOrderIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Экспорт заказа в CSV ───
  const exportOrder = async (id: string) => {
    try {
      const res = await fetch(`/api/orders/export?id=${id}&format=csv`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Не удалось выгрузить')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `order-${id.slice(-6)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Ошибка экспорта')
    }
  }

  // ─── Открытие диалога "Заказать всё мало" ───
  const openBulkDialog = () => {
    const items: DraftItem[] = []
    for (const t of lowTobaccos) {
      items.push({
        key: `t-${t.id}-${DRAFT_SEQ++}`,
        itemType: 'TOBACCO',
        itemId: t.id,
        brand: t.brand,
        line: t.line,
        flavor: t.flavor,
        name: `${t.brand} ${t.line} ${t.flavor}`.trim(),
        packGrams: t.defaultJarGrams,
        quantity: 1,
        unit: 'банок',
      })
    }
    for (const c of lowConsumables) {
      items.push({
        key: `c-${c.id}-${DRAFT_SEQ++}`,
        itemType: 'CONSUMABLE',
        itemId: c.id,
        name: c.name,
        quantity: 1,
        unit: c.unit,
      })
    }
    setBulkItems(items)
    setBulkAddBrand('')
    setBulkAddLine('')
    setBulkAddFlavor('')
    setBulkAddQty('1')
    setBulkAddUnit('банок')
    setBulkOpen(true)
  }

  const removeBulkItem = (key: string) => {
    setBulkItems((prev) => prev.filter((i) => i.key !== key))
  }

  const updateBulkQty = (key: string, qtyStr: string) => {
    const n = parseInt(qtyStr, 10)
    if (isNaN(n) || n < 1) return
    setBulkItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: n } : i)))
  }

  const updateBulkUnit = (key: string, unit: string) => {
    setBulkItems((prev) => prev.map((i) => (i.key === key ? { ...i, unit } : i)))
  }

  const addBulkTobacco = () => {
    const brand = bulkAddBrand.trim()
    const flavor = bulkAddFlavor.trim()
    if (!brand || !flavor) {
      toast.error('Укажите бренд и вкус')
      return
    }
    const qtyNum = parseInt(bulkAddQty, 10) || 1
    setBulkItems((prev) => [
      ...prev,
      {
        key: `new-${DRAFT_SEQ++}`,
        itemType: 'TOBACCO',
        brand,
        line: bulkAddLine.trim(),
        flavor,
        name: `${brand} ${bulkAddLine.trim()} ${flavor}`.trim(),
        packGrams: 250,
        quantity: qtyNum,
        unit: bulkAddUnit,
      },
    ])
    setBulkAddBrand('')
    setBulkAddLine('')
    setBulkAddFlavor('')
    setBulkAddQty('1')
  }

  const addBulkConsumable = (c: Consumable) => {
    setBulkItems((prev) => [
      ...prev,
      {
        key: `con-${c.id}-${DRAFT_SEQ++}`,
        itemType: 'CONSUMABLE',
        itemId: c.id,
        name: c.name,
        quantity: 1,
        unit: c.unit,
      },
    ])
  }

  const submitBulk = async () => {
    if (bulkItems.length === 0) {
      toast.error('Список пуст')
      return
    }
    setBulkSaving(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'SUBMITTED',
          items: bulkItems.map((i) => ({
            itemType: i.itemType,
            itemId: i.itemId,
            brand: i.brand,
            line: i.line,
            flavor: i.flavor,
            name: i.name,
            packGrams: i.packGrams ?? null,
            quantity: i.quantity,
            unit: i.unit,
          })),
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка создания заказа')
        return
      }
      toast.success(d.message || 'Заказ создан')
      setBulkOpen(false)
      setBulkItems([])
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setBulkSaving(false)
    }
  }

  // ─── Объединение выбранных заказов ───
  const mergeSelected = async () => {
    if (selectedOrderIds.size < 2) {
      toast.error('Выберите хотя бы 2 заказа')
      return
    }
    if (!confirm(`Объединить ${selectedOrderIds.size} заказов в один? Исходные будут помечены как объединённые.`)) {
      return
    }
    setMerging(true)
    try {
      const res = await fetch('/api/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mergeFrom: Array.from(selectedOrderIds) }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка объединения')
        return
      }
      toast.success(d.message || 'Объединено')
      setSelectedOrderIds(new Set())
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка соединения')
    } finally {
      setMerging(false)
    }
  }

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length
  const orderedCount = requests.filter((r) => r.status === 'ORDERED').length
  const doneCount = requests.filter((r) => r.status === 'DONE').length

  // Линейки для добавления в bulk
  const bulkLinesForBrand = useMemo(() => {
    if (!bulkAddBrand) return []
    return Array.from(new Set(tobaccos.filter((t) => t.brand === bulkAddBrand && t.line).map((t) => t.line)))
  }, [tobaccos, bulkAddBrand])

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">{isSenior ? 'Все заявки и заказы' : 'Мои заявки'}</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Закупки
          </h2>
        </div>
        {isSenior && (
          <Button
            variant="outline"
            size="sm"
            onClick={openBulkDialog}
            className="border-ember text-ember hover:bg-ember hover:text-ember-foreground"
          >
            <Flame className="h-3.5 w-3.5" />
            Заказать всё мало
          </Button>
        )}
      </div>

      {/* Сводка для старшего */}
      {isSenior && requests.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className={`border rounded-md p-4 flex items-center gap-3 shadow-sm-soft transition-base ${pendingCount > 0 ? 'frame-ember' : 'border-border'}`}>
            <Inbox className={`h-4 w-4 ${pendingCount > 0 ? 'text-ember' : 'text-muted-foreground/70'}`} />
            <div>
              <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{pendingCount}</p>
              <p className="label-mono mt-1">ожидают</p>
            </div>
          </div>
          <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
            <ShoppingCart className="h-4 w-4 text-muted-foreground/70" />
            <div>
              <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{orderedCount}</p>
              <p className="label-mono mt-1">заказано</p>
            </div>
          </div>
          <div className="border border-border rounded-md p-4 flex items-center gap-3 shadow-sm-soft">
            <CheckCircle2 className="h-4 w-4 text-muted-foreground/70" />
            <div>
              <p className="text-2xl font-mono font-bold leading-none tabular text-foreground">{doneCount}</p>
              <p className="label-mono mt-1">получено</p>
            </div>
          </div>
        </div>
      )}

      {/* Форма добавления заявки — для всех мастеров */}
      <div className="frame p-5 space-y-3 rounded-md shadow-sm-soft">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 label-mono">
            <Package className="h-3.5 w-3.5" />
            Новая заявка
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowStructured((v) => !v)}
            className="h-7 text-[11px]"
          >
            {showStructured ? 'Свободный ввод' : 'Структурированно'}
          </Button>
        </div>

        {showStructured ? (
          <div className="space-y-3">
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
                onValueChange={(v) => { setBrandInput(v); setFlavorId('') }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Выберите бренд" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__new__">— новый бренд —</SelectItem>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            <div className="space-y-1.5">
              <Label>Заметка (необязательно)</Label>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="например, срочно"
              />
            </div>

            <Button
              className="w-full"
              disabled={submittingStruct}
              onClick={submitStructured}
            >
              {submittingStruct ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
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
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  void submitText()
                }
              }}
            />
            <Button
              className="w-full"
              disabled={!text.trim() || submitting}
              onClick={submitText}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Отправить старшему
            </Button>
          </>
        )}
      </div>

      {/* Объединить выбранные заказы */}
      {isSenior && selectedOrderIds.size >= 2 && (
        <div className="frame-ember rounded-md p-3 flex items-center justify-between gap-3 fade-in">
          <div className="flex items-center gap-2 label-mono">
            <GitMerge className="h-3.5 w-3.5 text-ember" />
            Выбрано заказов: {selectedOrderIds.size}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setSelectedOrderIds(new Set())}
            >
              Сбросить
            </Button>
            <Button
              size="sm"
              onClick={mergeSelected}
              disabled={merging}
            >
              {merging ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <GitMerge className="h-3 w-3" />}
              Объединить в 1 заказ
            </Button>
          </div>
        </div>
      )}

      {/* Sub-фильтры */}
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
          onClick={() => setFilter('pending')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'pending' ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Ожидают
        </button>
        <button
          onClick={() => setFilter('ordered')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'ordered' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Заказано
        </button>
        <button
          onClick={() => setFilter('received')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
            filter === 'received' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Получено
        </button>
      </div>

      {/* Единый список заявок и заказов */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {filter !== 'all' ? 'Ничего не найдено.' : isSenior ? 'Заявок и заказов пока нет.' : 'Ты ещё не оставил заявок.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {filteredItems.map((item) => {
                if (item.kind === 'request') {
                  const next = NEXT_STATUS[item.data.status]
                  return (
                    <div key={item.id} className="p-4 border-b border-border last:border-b-0 space-y-2">
                      <div className="flex items-start gap-3">
                        {isSenior && item.master && (
                          <div
                            className={`mt-0.5 h-9 w-9 shrink-0 ${masterAvatarClass(item.master.color)} flex items-center justify-center text-[10px] font-mono font-bold text-white rounded-md`}
                          >
                            {initials(item.master.name)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isSenior && (
                            <div className="label-mono-sm mb-1">
                              {item.master?.name}
                              {item.isMine && <span className="ml-1.5 text-ember">· ты</span>}
                            </div>
                          )}
                          <p className="body-sans text-sm break-words">{item.content}</p>
                          {item.data.grams != null && (
                            <p className="label-mono-sm mt-1">
                              Нужно: <span className="text-foreground font-bold">{item.data.grams}г</span>
                            </p>
                          )}
                          <div className="flex items-center gap-2 mt-2">
                            <Badge variant="outline" className={STATUS_STYLE_REQ[item.data.status]}>
                              {REQUEST_STATUS_LABELS[item.data.status]}
                            </Badge>
                            <span className="label-mono-sm">{timeAgo(item.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      {isSenior && next && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[11px] ml-12"
                          disabled={updatingId === item.id}
                          onClick={() => changeStatus(item.id, next)}
                        >
                          {updatingId === item.id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <ShoppingCart className="h-3 w-3" />
                          )}
                          {NEXT_LABEL[item.data.status]}
                        </Button>
                      )}
                    </div>
                  )
                }

                // PurchaseOrder card
                const order = item.data
                const nextStatus = PURCHASE_NEXT_STATUS[order.status]
                const isSelected = selectedOrderIds.has(order.id)
                const canSelect = order.status !== 'MERGED' && order.status !== 'RECEIVED'
                return (
                  <div
                    key={order.id}
                    className={`p-4 border-b border-border last:border-b-0 space-y-2 transition-base ${order.isMerged ? 'bg-muted/30' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      {isSenior && (
                        <Checkbox
                          checked={isSelected}
                          disabled={!canSelect}
                          onCheckedChange={() => toggleOrderSelection(order.id)}
                          className="mt-1"
                          aria-label="Выбрать для объединения"
                        />
                      )}
                      <div className="mt-0.5 flex items-center justify-center h-9 w-9 shrink-0 border border-border rounded-md text-muted-foreground">
                        {order.isMerged ? (
                          <GitMerge className="h-3.5 w-3.5" />
                        ) : (
                          <Layers className="h-3.5 w-3.5" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {order.isMerged && (
                          <div className="label-mono-sm mb-1 text-foreground">
                            Объединённый заказ
                          </div>
                        )}
                        <p className="body-sans text-sm break-words">{item.content}</p>
                        <p className="label-mono-sm mt-1">
                          Позиций: <span className="text-foreground font-bold">{order.itemsCount}</span>
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <Badge variant="outline" className={getStatusClass(order.status)}>
                            {PURCHASE_STATUS_LABELS[order.status] ?? order.status}
                          </Badge>
                          <span className="label-mono-sm">{timeAgo(order.createdAt)}</span>
                        </div>
                      </div>
                      {isSenior && (
                        <div className="flex flex-col gap-2 shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-[11px]"
                            onClick={() => openEditOrder(order)}
                            title="Редактировать"
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Изменить
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 text-[11px]"
                            onClick={() => exportOrder(order.id)}
                            title="Экспорт CSV"
                          >
                            <Download className="h-3 w-3 mr-1" />
                            CSV
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-[11px] text-muted-foreground hover:text-ember"
                            onClick={() => deleteOrder(order.id)}
                            title="Удалить"
                            disabled={updatingId === order.id}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Удалить
                          </Button>
                        </div>
                      )}
                    </div>
                    {isSenior && nextStatus && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] ml-12"
                        disabled={updatingId === order.id}
                        onClick={() => changeOrderStatus(order.id, nextStatus)}
                      >
                        {updatingId === order.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                        {PURCHASE_NEXT_LABEL[order.status]}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Диалог "Заказать всё мало" */}
      <Dialog open={bulkOpen} onOpenChange={(o) => { if (!bulkSaving) setBulkOpen(o) }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <span className="label-mono">Заказать всё мало</span>
            <DialogTitle>Сборка заказа</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {bulkItems.length === 0 ? (
              <div className="frame border-border rounded-md p-6 text-center">
                <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-muted-foreground/70" />
                <p className="body-sans text-sm text-muted-foreground">
                  Нет позиций «мало». Можно добавить вручную ниже.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {bulkItems.map((it) => (
                  <div key={it.key} className="flex items-center gap-2 border border-border rounded-md p-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {it.itemType === 'TOBACCO' ? (
                          <Flame className="h-3 w-3 text-ember shrink-0" />
                        ) : (
                          <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                        )}
                        <span className="font-mono text-sm font-bold tracking-tight text-foreground truncate">
                          {it.name}
                        </span>
                      </div>
                      {it.packGrams && (
                        <span className="label-mono-sm text-muted-foreground">
                          банка {it.packGrams}г
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) => updateBulkQty(it.key, e.target.value)}
                      className="w-16 font-mono tabular text-center"
                    />
                    <Input
                      value={it.unit}
                      onChange={(e) => updateBulkUnit(it.key, e.target.value)}
                      className="w-20 font-mono"
                      placeholder="шт"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-ember shrink-0"
                      onClick={() => removeBulkItem(it.key)}
                      aria-label="Убрать"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Добавить табак вручную */}
            <div className="frame border-border rounded-md p-3 space-y-2">
              <p className="label-mono">Добавить табак</p>
              <div className="grid grid-cols-2 gap-2">
                <Select
                  value={bulkAddBrand}
                  onValueChange={(v) => { setBulkAddBrand(v); setBulkAddLine('') }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Бренд" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={bulkAddLine}
                  onValueChange={setBulkAddLine}
                  disabled={bulkLinesForBrand.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Линейка (необязательно)" />
                  </SelectTrigger>
                  <SelectContent>
                    {bulkLinesForBrand.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input
                placeholder="Вкус"
                value={bulkAddFlavor}
                onChange={(e) => setBulkAddFlavor(e.target.value)}
              />
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  value={bulkAddQty}
                  onChange={(e) => setBulkAddQty(e.target.value)}
                  className="font-mono tabular"
                  placeholder="Кол-во"
                />
                <Input
                  value={bulkAddUnit}
                  onChange={(e) => setBulkAddUnit(e.target.value)}
                  className="font-mono w-24"
                  placeholder="шт"
                />
                <Button onClick={addBulkTobacco} size="sm">
                  <Plus className="h-3.5 w-3.5" /> Добавить
                </Button>
              </div>
            </div>

            {/* Добавить расходник */}
            {isSenior && consumables.length > 0 && (
              <div className="frame border-border rounded-md p-3 space-y-2">
                <p className="label-mono">Добавить расходник</p>
                <div className="flex flex-wrap gap-1.5">
                  {consumables.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => addBulkConsumable(c)}
                      className={`px-2 py-1 text-[11px] font-mono border rounded-sm transition-base ${
                        c.isLow ? 'border-ember text-ember hover:bg-ember hover:text-ember-foreground' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      + {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>
              Отмена
            </Button>
            <Button onClick={submitBulk} disabled={bulkSaving || bulkItems.length === 0}>
              {bulkSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Flame className="h-3.5 w-3.5" />
              )}
              Создать заказ ({bulkItems.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог редактирования заказа (пока просто просмотр) */}
      {editOrder && (
        <Dialog open={!!editOrder} onOpenChange={(o) => { if (!o || !editSaving) { setEditOrder(null) } }}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <span className="label-mono">{editOrder.isMerged ? 'Объединённый заказ' : 'Редактирование заказа'}</span>
              <DialogTitle>
                {editOrder.isMerged ? 'Объединённый заказ' : 'Заказ'} · {editItems.length} поз.
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 max-h-[50vh] overflow-y-auto">
              {editItems.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-4">Нет позиций. Добавьте ниже.</p>
              )}
              {editItems.map((it, idx) => (
                <div key={idx} className="flex items-start gap-2 border border-border rounded-md p-2">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Input
                      placeholder="Наименование (Darkside Core Cola / Угли...)"
                      value={it.name}
                      onChange={(e) => updateEditItem(idx, 'name', e.target.value)}
                      className="h-8 text-sm"
                    />
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        placeholder="Кол-во"
                        value={it.quantity}
                        onChange={(e) => updateEditItem(idx, 'quantity', Number(e.target.value) || 0)}
                        className="h-8 w-20 text-sm tabular"
                      />
                      <Input
                        placeholder="ед."
                        value={it.unit}
                        onChange={(e) => updateEditItem(idx, 'unit', e.target.value)}
                        className="h-8 w-20 text-sm"
                      />
                      {it.itemType === 'TOBACCO' && (
                        <Input
                          type="number"
                          placeholder="гр/банка"
                          value={it.packGrams ?? ''}
                          onChange={(e) => updateEditItem(idx, 'packGrams', Number(e.target.value) || 0)}
                          className="h-8 w-24 text-sm tabular"
                        />
                      )}
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-ember shrink-0"
                    onClick={() => removeEditItem(idx)}
                    title="Удалить позицию"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addEditItem}
              className="w-full"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Добавить позицию
            </Button>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditOrder(null)} disabled={editSaving}>
                Отмена
              </Button>
              <Button onClick={saveEditOrder} disabled={editSaving}>
                {editSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                Сохранить
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function formatItemName(it: PurchaseOrderItem): string {
  if (it.itemType === 'CONSUMABLE') return it.name
  const parts = [it.brand, it.line, it.flavor].filter((x) => x && x.trim())
  return parts.length > 0 ? parts.join(' ') : it.name
}

function getStatusClass(status: string): string {
  if (status === 'SUBMITTED' || status === 'DRAFT') return 'border-ember text-ember bg-transparent'
  if (status === 'ORDERED') return 'border-foreground text-foreground bg-transparent'
  if (status === 'RECEIVED') return 'border-border text-muted-foreground bg-transparent'
  if (status === 'MERGED') return 'border-foreground/30 text-muted-foreground bg-muted/30'
  return 'border-border text-muted-foreground bg-transparent'
}
