'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { timeAgo } from '@/lib/master-utils'
import {
  Loader2,
  Package,
  Plus,
  X,
  Trash2,
  Flame,
  Layers,
  CheckCircle2,
  ImageIcon,
  FileText,
  Sparkles,
  Upload,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface SupplyItem {
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

interface Supply {
  id: string
  status: string
  supplier: string | null
  note: string | null
  hasPhoto: boolean
  hasPdf: boolean
  fileName: string | null
  createdAt: string
  updatedAt: string
  items: SupplyItem[]
}

interface Tobacco {
  id: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: number
}

interface Consumable {
  id: string
  name: string
  unit: string
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
function makeKey(prefix: string) {
  return `${prefix}-${DRAFT_SEQ++}-${Date.now()}`
}

interface SupplyPanelProps {
  refreshKey: number
  onRefresh: () => void
}

type ListTab = 'pending' | 'accepted'

export function SupplyPanel({ refreshKey, onRefresh }: SupplyPanelProps) {
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])
  const [loading, setLoading] = useState(true)

  // Форма создания поставки
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [supplier, setSupplier] = useState('')
  const [note, setNote] = useState('')
  const [photoBase64, setPhotoBase64] = useState<string | null>(null)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfFileName, setPdfFileName] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [parsingAI, setParsingAI] = useState(false)

  // Табак-инпуты
  const [brandInput, setBrandInput] = useState<string>('__new__')
  const [newBrand, setNewBrand] = useState('')
  const [flavorId, setFlavorId] = useState<string>('')
  const [tobQty, setTobQty] = useState('1')
  const [tobUnit, setTobUnit] = useState<'банок' | 'грамм'>('банок')

  // Расходник-инпуты
  const [conId, setConId] = useState<string>('__new__')
  const [newConName, setNewConName] = useState('')
  const [conQty, setConQty] = useState('1')
  const [conUnit, setConUnit] = useState('шт')

  // Список: переключатель "Ожидают" | "Принятые"
  const [listTab, setListTab] = useState<ListTab>('pending')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Просмотр фото
  const [photoView, setPhotoView] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [supRes, tobRes, conRes] = await Promise.all([
        fetch('/api/supplies'),
        fetch('/api/tobaccos'),
        fetch('/api/consumables'),
      ])
      const supData = await supRes.json()
      setSupplies(supData.supplies ?? [])
      const tobData = await tobRes.json()
      setTobaccos(tobData.tobaccos ?? [])
      const conData = await conRes.json()
      setConsumables(conData.consumables ?? [])
    } catch {
      toast.error('Не удалось загрузить поставки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Список уникальных брендов
  const brands = useMemo(() => {
    const set = new Set<string>()
    for (const t of tobaccos) set.add(t.brand)
    return Array.from(set).sort()
  }, [tobaccos])

  const flavorOptions = useMemo(() => {
    if (brandInput === '__new__') return []
    return tobaccos.filter((t) => t.brand === brandInput)
  }, [tobaccos, brandInput])

  const pendingSupplies = useMemo(() => supplies.filter((s) => s.status === 'PENDING'), [supplies])
  const acceptedSupplies = useMemo(() => supplies.filter((s) => s.status === 'ACCEPTED'), [supplies])
  const visibleSupplies = listTab === 'pending' ? pendingSupplies : acceptedSupplies

  // ─── Добавление табака ───
  const addTobacco = () => {
    const brand = brandInput === '__new__' ? newBrand.trim() : brandInput
    if (!brand) {
      toast.error('Выберите бренд или введите новый')
      return
    }
    const qtyNum = parseInt(tobQty, 10) || 1
    let draft: DraftItem
    if (flavorId) {
      const t = tobaccos.find((x) => x.id === flavorId)
      if (t) {
        draft = {
          key: makeKey('t'),
          itemType: 'TOBACCO',
          itemId: t.id,
          brand: t.brand,
          line: t.line || undefined,
          flavor: t.flavor,
          name: `${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}`.trim(),
          packGrams: t.defaultJarGrams,
          quantity: qtyNum,
          unit: tobUnit,
        }
      } else {
        draft = {
          key: makeKey('t'),
          itemType: 'TOBACCO',
          brand,
          flavor: '',
          name: brand,
          quantity: qtyNum,
          unit: tobUnit,
        }
      }
    } else {
      draft = {
        key: makeKey('t'),
        itemType: 'TOBACCO',
        brand,
        flavor: '',
        name: brand,
        quantity: qtyNum,
        unit: tobUnit,
      }
    }
    setDraftItems((prev) => [...prev, draft])
    setNewBrand('')
    setFlavorId('')
    setTobQty('1')
    setBrandInput('__new__')
  }

  const addConsumable = () => {
    const qtyNum = parseInt(conQty, 10) || 1
    let draft: DraftItem
    if (conId === '__new__') {
      const name = newConName.trim()
      if (!name) {
        toast.error('Введите название расходника')
        return
      }
      draft = {
        key: makeKey('c'),
        itemType: 'CONSUMABLE',
        name,
        quantity: qtyNum,
        unit: conUnit.trim() || 'шт',
      }
    } else {
      const c = consumables.find((x) => x.id === conId)
      if (!c) return
      draft = {
        key: makeKey('c'),
        itemType: 'CONSUMABLE',
        itemId: c.id,
        name: c.name,
        quantity: qtyNum,
        unit: c.unit,
      }
    }
    setDraftItems((prev) => [...prev, draft])
    setConId('__new__')
    setNewConName('')
    setConQty('1')
    setConUnit('шт')
  }

  const removeDraftItem = (key: string) => {
    setDraftItems((prev) => prev.filter((i) => i.key !== key))
  }

  const updateDraftQty = (key: string, qtyStr: string) => {
    const n = parseInt(qtyStr, 10)
    if (isNaN(n) || n < 1) return
    setDraftItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: n } : i)))
  }

  const updateDraftUnit = (key: string, unit: string) => {
    setDraftItems((prev) => prev.map((i) => (i.key === key ? { ...i, unit } : i)))
  }

  // ─── Загрузка файла ───
  const handleFile = (file: File | null, kind: 'photo' | 'pdf') => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      if (kind === 'photo') {
        setPhotoBase64(result)
      } else {
        setPdfBase64(result)
        setPdfFileName(file.name)
      }
    }
    reader.readAsDataURL(file)
  }

  // ─── AI парсинг PDF ───
  const parseAI = async () => {
    if (!pdfBase64) {
      toast.error('Сначала загрузите PDF')
      return
    }
    setParsingAI(true)
    try {
      const res = await fetch('/api/supplies/ai-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64 }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка AI-парсинга')
        return
      }
      const items: Array<{
        itemType: string
        brand?: string | null
        line?: string | null
        flavor?: string | null
        name: string
        packGrams?: number | null
        quantity: number
        unit: string
      }> = d.items ?? []
      if (items.length === 0) {
        toast.info('AI не нашёл позиций в PDF')
        return
      }
      const drafts: DraftItem[] = items.map((it) => ({
        key: makeKey('ai'),
        itemType: it.itemType === 'CONSUMABLE' ? 'CONSUMABLE' : 'TOBACCO',
        brand: it.brand ?? undefined,
        line: it.line ?? undefined,
        flavor: it.flavor ?? undefined,
        name: it.name,
        packGrams: it.packGrams ?? undefined,
        quantity: it.quantity,
        unit: it.unit,
      }))
      setDraftItems((prev) => [...prev, ...drafts])
      toast.success(`AI добавил ${drafts.length} позиций (проверьте список)`)
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setParsingAI(false)
    }
  }

  // ─── Создание поставки ───
  const submitSupply = async () => {
    if (draftItems.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: draftItems.map((i) => ({
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
          supplier: supplier.trim() || null,
          note: note.trim() || null,
          photoBase64,
          pdfBase64,
          fileName: pdfFileName,
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка создания поставки')
        return
      }
      toast.success(d.message || 'Поставка создана')
      // Очистка формы
      setDraftItems([])
      setSupplier('')
      setNote('')
      setPhotoBase64(null)
      setPdfBase64(null)
      setPdfFileName(null)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setCreating(false)
    }
  }

  // ─── Принятие поставки ───
  const acceptSupply = async (id: string) => {
    if (!confirm('Принять поставку? Склад будет обновлён.')) return
    setUpdatingId(id)
    try {
      const res = await fetch('/api/supplies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'ACCEPTED' }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка принятия')
        return
      }
      toast.success(d.message || 'Поставка принята')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Удаление поставки ───
  const deleteSupply = async (id: string) => {
    if (!confirm('Удалить поставку?')) return
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/supplies?id=${id}`, { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка удаления')
        return
      }
      toast.success('Поставка удалена')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setUpdatingId(null)
    }
  }

  // ─── Получение фото/pdf для просмотра ───
  const fetchAttachment = async (id: string, kind: 'photo' | 'pdf'): Promise<string | null> => {
    try {
      const res = await fetch(`/api/supplies/${id}/attachment?kind=${kind}`)
      if (!res.ok) return null
      const d = await res.json()
      return d.base64 ?? null
    } catch {
      return null
    }
  }

  const openPhoto = async (id: string) => {
    const data = await fetchAttachment(id, 'photo')
    if (data) setPhotoView(data)
    else toast.error('Фото недоступно')
  }

  const openPdf = async (id: string) => {
    const data = await fetchAttachment(id, 'pdf')
    if (!data) {
      toast.error('PDF недоступен')
      return
    }
    // Открываем PDF в новой вкладке
    const win = window.open()
    if (win) {
      win.document.write(
        `<iframe src="${data}" style="width:100%;height:100%;border:none;" allowfullscreen></iframe>`,
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">Входящие накладные</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Поставки
          </h2>
        </div>
        <Button
          size="icon"
          variant="outline"
          onClick={() => { load(); onRefresh() }}
          title="Обновить"
          aria-label="Обновить"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ─── Новая поставка ─── */}
      <div className="frame p-5 space-y-4 rounded-md shadow-sm-soft">
        <div className="flex items-center gap-2 label-mono">
          <Package className="h-3.5 w-3.5" />
          Новая поставка
        </div>

        {/* Секция: Табак */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 label-mono-sm">
            <Flame className="h-3 w-3 text-ember" />
            Табак
          </div>
          <div className="space-y-1.5">
            <Label>Бренд</Label>
            {brandInput === '__new__' && (
              <Input
                placeholder="Новый бренд"
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

          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="space-y-1.5">
              <Label>Количество</Label>
              <Input
                type="number"
                min={1}
                value={tobQty}
                onChange={(e) => setTobQty(e.target.value)}
                className="font-mono tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Единица</Label>
              <Select value={tobUnit} onValueChange={(v: 'банок' | 'грамм') => setTobUnit(v)}>
                <SelectTrigger className="w-[110px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="банок">банок</SelectItem>
                  <SelectItem value="грамм">грамм</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={addTobacco}
                className="w-full"
                title="Добавить табак"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Секция: Расходники */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2 label-mono-sm">
            <Layers className="h-3 w-3 text-muted-foreground" />
            Расходники
          </div>
          <div className="space-y-1.5">
            <Label>Расходник</Label>
            {conId === '__new__' && (
              <Input
                placeholder="Новый расходник"
                value={newConName}
                onChange={(e) => setNewConName(e.target.value)}
              />
            )}
            <Select
              value={conId}
              onValueChange={setConId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Выберите расходник" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__new__">— новый расходник —</SelectItem>
                {consumables.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="space-y-1.5">
              <Label>Количество</Label>
              <Input
                type="number"
                min={1}
                value={conQty}
                onChange={(e) => setConQty(e.target.value)}
                className="font-mono tabular"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Единица</Label>
              <Input
                value={conUnit}
                onChange={(e) => setConUnit(e.target.value)}
                placeholder="шт"
                className="w-[110px] font-mono"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={addConsumable}
                className="w-full"
                title="Добавить расходник"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Доп. поля */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label>Поставщик</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              placeholder="например, Tabakioff"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Заметка</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="необязательно"
            />
          </div>
        </div>

        {/* Файлы: фото + PDF */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="space-y-1.5">
            <Label>Фото накладной</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null, 'photo')}
                />
                <span className="inline-flex items-center justify-center gap-2 h-9 px-3 w-full border border-border rounded-md cursor-pointer hover:bg-muted transition-base text-sm">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {photoBase64 ? 'Заменить фото' : 'Загрузить фото'}
                </span>
              </label>
              {photoBase64 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-ember"
                  onClick={() => setPhotoBase64(null)}
                  title="Убрать фото"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {photoBase64 && (
              <div className="mt-2">
                <img
                  src={photoBase64}
                  alt="Фото накладной"
                  className="h-20 w-auto object-cover rounded-md border border-border"
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>PDF накладной</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null, 'pdf')}
                />
                <span className="inline-flex items-center justify-center gap-2 h-9 px-3 w-full border border-border rounded-md cursor-pointer hover:bg-muted transition-base text-sm">
                  <FileText className="h-3.5 w-3.5" />
                  {pdfBase64 ? 'Заменить PDF' : 'Загрузить PDF'}
                </span>
              </label>
              {pdfBase64 && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 text-muted-foreground hover:text-ember"
                  onClick={() => { setPdfBase64(null); setPdfFileName(null) }}
                  title="Убрать PDF"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {pdfFileName && (
              <p className="label-mono-sm mt-1 truncate">{pdfFileName}</p>
            )}
            {pdfBase64 && (
              <Button
                size="sm"
                variant="outline"
                onClick={parseAI}
                disabled={parsingAI}
                className="h-8 text-[11px] w-full border-ember text-ember hover:bg-ember hover:text-ember-foreground"
              >
                {parsingAI ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3 mr-1" />
                )}
                AI из PDF
              </Button>
            )}
          </div>
        </div>

        {/* Список добавленных позиций */}
        {draftItems.length > 0 && (
          <div className="space-y-2 border-t border-border pt-4">
            <span className="label-mono">Позиции ({draftItems.length})</span>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {draftItems.map((it) => (
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
                    onChange={(e) => updateDraftQty(it.key, e.target.value)}
                    className="w-16 font-mono tabular text-center"
                  />
                  <Input
                    value={it.unit}
                    onChange={(e) => updateDraftUnit(it.key, e.target.value)}
                    className="w-20 font-mono"
                    placeholder="шт"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-ember shrink-0"
                    onClick={() => removeDraftItem(it.key)}
                    aria-label="Убрать"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit */}
        <Button
          className="w-full"
          disabled={creating || draftItems.length === 0}
          onClick={submitSupply}
        >
          {creating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Создать поставку ({draftItems.length})
        </Button>
      </div>

      {/* Переключатель списков */}
      <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
        <button
          onClick={() => setListTab('pending')}
          className={`px-4 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            listTab === 'pending' ? 'bg-ember text-ember-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Ожидают ({pendingSupplies.length})
        </button>
        <button
          onClick={() => setListTab('accepted')}
          className={`px-4 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
            listTab === 'accepted' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <CheckCircle2 className="h-3 w-3 inline mr-1" />
          Принятые ({acceptedSupplies.length})
        </button>
      </div>

      {/* Список поставок */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : visibleSupplies.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {listTab === 'pending' ? 'Нет ожидающих поставок.' : 'Нет принятых поставок.'}
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="stagger-children">
              {visibleSupplies.map((s) => (
                <div
                  key={s.id}
                  className="p-4 border-b border-border last:border-b-0 space-y-2"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex items-center justify-center h-9 w-9 shrink-0 border border-border rounded-md text-muted-foreground">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={s.status === 'PENDING' ? 'border-ember text-ember bg-transparent' : 'border-border text-muted-foreground bg-transparent'}>
                          {s.status === 'PENDING' ? 'Ожидает' : 'Принята'}
                        </Badge>
                        <span className="label-mono-sm">{timeAgo(s.createdAt)}</span>
                        {s.supplier && (
                          <span className="label-mono-sm text-foreground">· {s.supplier}</span>
                        )}
                      </div>
                      {s.note && (
                        <p className="body-sans text-sm text-muted-foreground mt-1 break-words">
                          {s.note}
                        </p>
                      )}
                      <ul className="mt-2 space-y-1">
                        {s.items.map((it) => (
                          <li key={it.id} className="flex items-center gap-2 text-sm">
                            {it.itemType === 'TOBACCO' ? (
                              <Flame className="h-3 w-3 text-ember shrink-0" />
                            ) : (
                              <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                            )}
                            <span className="font-sans text-foreground truncate flex-1">
                              {it.itemType === 'TOBACCO'
                                ? [it.brand, it.line, it.flavor].filter(Boolean).join(' ') || it.name
                                : it.name}
                            </span>
                            <span className="label-mono-sm shrink-0">
                              {it.quantity} {it.unit}
                              {it.packGrams && ` · ${it.packGrams}г`}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {s.hasPhoto && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] px-2"
                            onClick={() => openPhoto(s.id)}
                            title="Фото"
                          >
                            <ImageIcon className="h-3 w-3 mr-1" />
                            Фото
                          </Button>
                        )}
                        {s.hasPdf && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] px-2"
                            onClick={() => openPdf(s.id)}
                            title="PDF"
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            PDF
                          </Button>
                        )}
                        {s.status === 'PENDING' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[11px] border-ember text-ember hover:bg-ember hover:text-ember-foreground"
                            onClick={() => acceptSupply(s.id)}
                            disabled={updatingId === s.id}
                          >
                            {updatingId === s.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                            )}
                            Принять поставку
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] px-2 text-muted-foreground hover:text-ember"
                          onClick={() => deleteSupply(s.id)}
                          disabled={updatingId === s.id}
                          title="Удалить"
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Удалить
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Просмотр фото */}
      <Dialog
        open={photoView !== null}
        onOpenChange={(o) => { if (!o) setPhotoView(null) }}
      >
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <span className="label-mono">Фото накладной</span>
            <DialogTitle>Просмотр</DialogTitle>
          </DialogHeader>
          {photoView && (
            <img
              src={photoView}
              alt="Фото накладной"
              className="w-full max-h-[70vh] object-contain rounded-md border border-border"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
