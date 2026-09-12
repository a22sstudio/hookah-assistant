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
import { MasterRequest, REQUEST_STATUS_LABELS } from '@/lib/types'
import { Tobacco } from '@/lib/types'
import { masterAvatarClass, timeAgo, initials } from '@/lib/master-utils'
import { Send, Loader2, Inbox, ShoppingCart, CheckCircle2, Package, Plus, Tag } from 'lucide-react'
import { toast } from 'sonner'

interface ConsumableRef {
  id: string
  name: string
}

interface MasterRequestsProps {
  role: 'SENIOR' | 'REGULAR'
  refreshKey: number
  onRefresh: () => void
}

type FilterChip = 'all' | 'ordered' | 'done'

const STATUS_STYLE: Record<MasterRequest['status'], string> = {
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

const NEXT_ICON = {
  PENDING: ShoppingCart,
  ORDERED: CheckCircle2,
  DONE: CheckCircle2,
}

export function MasterRequests({ role, refreshKey, onRefresh }: MasterRequestsProps) {
  const [items, setItems] = useState<MasterRequest[]>([])
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [consumables, setConsumables] = useState<ConsumableRef[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterChip>('all')

  // Свободный текст
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  // Структурированная форма
  const [showStructured, setShowStructured] = useState(false)
  const [brandInput, setBrandInput] = useState<string>('__new__')
  const [newBrand, setNewBrand] = useState('')
  const [flavorId, setFlavorId] = useState<string>('')
  const [qty, setQty] = useState('1')
  const [unit, setUnit] = useState<'банок' | 'грамм'>('банок')
  const [note, setNote] = useState('')
  const [submittingStruct, setSubmittingStruct] = useState(false)

  const isSenior = role === 'SENIOR'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const url = isSenior ? '/api/requests' : '/api/requests?mine=1'
      const res = await fetch(url)
      if (!res.ok) return
      const d = await res.json()
      setItems(d.requests ?? [])
      // Загружаем справочник табаков для structured form
      const tRes = await fetch('/api/tobaccos')
      if (tRes.ok) {
        const tData = await tRes.json()
        setTobaccos(tData.tobaccos ?? [])
      }
      // Загружаем список расходников (для тегов)
      const cRes = await fetch('/api/consumables')
      if (cRes.ok) {
        const cData = await cRes.json()
        setConsumables(cData.consumables ?? [])
      }
    } catch {
      toast.error('Не удалось загрузить заявки')
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

  // Линейка/вкус, отфильтрованные по выбранному бренду
  const flavorOptions = useMemo(() => {
    if (brandInput === '__new__') return []
    return tobaccos.filter((t) => t.brand === brandInput)
  }, [tobaccos, brandInput])

  // Список заявок по фильтру
  const filteredItems = useMemo(() => {
    if (filter === 'all') return items
    if (filter === 'ordered') return items.filter((r) => r.status === 'ORDERED')
    if (filter === 'done') return items.filter((r) => r.status === 'DONE')
    return items
  }, [items, filter])

  // Поиск расходника в тексте заявки (case-insensitive, по имени)
  const findConsumableInText = useCallback(
    (text: string): ConsumableRef | null => {
      const lower = text.toLowerCase()
      // Сначала ищем точное совпадение имени
      let found = consumables.find((c) => lower.includes(c.name.toLowerCase()))
      if (!found) {
        // Частичное: первые 5+ символов имени
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

  const submit = async () => {
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

    let text = ''
    let grams: number | undefined
    if (flavorId) {
      const t = tobaccos.find((x) => x.id === flavorId)
      if (t) {
        text = `${t.brand} ${t.line} ${t.flavor} — ${qtyNum} ${unit}`
        if (unit === 'банок') grams = t.defaultJarGrams * qtyNum
        else grams = qtyNum
      }
    } else if (brandInput !== '__new__') {
      // Бренд выбран, но конкретный вкус не выбран
      text = `${brand} — ${qtyNum} ${unit}`
    } else {
      // Новый бренд
      text = `${brand} — ${qtyNum} ${unit}`
    }

    if (note.trim()) {
      text += ` · ${note.trim()}`
    }

    setSubmittingStruct(true)
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, grams: grams ?? null }),
      })
      const d = await res.json()
      if (!res.ok) {
        toast.error(d.error || 'Ошибка')
        return
      }
      toast.success(`Заявка создана: ${text}`)
      // Очистка
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

  const pendingCount = items.filter((r) => r.status === 'PENDING').length
  const orderedCount = items.filter((r) => r.status === 'ORDERED').length
  const doneCount = items.filter((r) => r.status === 'DONE').length

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
        <div>
          <span className="label-mono">{isSenior ? 'Все заявки' : 'Мои заявки'}</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            {isSenior ? 'Заявки мастеров' : 'Заявки на закуп'}
          </h2>
        </div>
      </div>

      {/* Сводка для старшего */}
      {isSenior && items.length > 0 && (
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

      {/* Sub-фильтры (3 кнопки) */}
      <div className="flex gap-0 border border-border rounded-md overflow-hidden w-fit">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Всё
        </button>
        <button
          onClick={() => setFilter('ordered')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors border-r border-border ${
            filter === 'ordered'
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Заказано
        </button>
        <button
          onClick={() => setFilter('done')}
          className={`px-3 py-2 text-[11px] font-mono uppercase tracking-tight transition-base transition-colors ${
            filter === 'done'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Получено
        </button>
      </div>

      {/* Форма добавления — только для обычного мастера */}
      {!isSenior && (
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
              {/* Бренд — селект существующих или ввод нового */}
              <div className="space-y-1.5">
                <Label>Бренд</Label>
                {brandInput === '__new__' ? (
                  <Input
                    placeholder="Новый бренд, например BlackBurn"
                    value={newBrand}
                    onChange={(e) => setNewBrand(e.target.value)}
                  />
                ) : null}
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

              {/* Линейка/вкус (только если бренд выбран из существующих) */}
              {brandInput !== '__new__' && flavorOptions.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Линейка / вкус</Label>
                  <Select
                    value={flavorId}
                    onValueChange={setFlavorId}
                  >
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

              {/* Количество + единица */}
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

              {/* Заметка */}
              <div className="space-y-1.5">
                <Label>Заметка (необязательно)</Label>
                <Input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="например, срочно"
                />
              </div>

              {/* Превью текста */}
              {(brandInput !== '__new__' ? brandInput : newBrand.trim()) && (
                <div className="border border-border rounded-md p-2.5 bg-muted/40">
                  <p className="label-mono-sm text-muted-foreground mb-1">
                    Превью заявки:
                  </p>
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
                    void submit()
                  }
                }}
              />
              <Button
                className="w-full"
                disabled={!text.trim() || submitting}
                onClick={submit}
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
      )}

      {/* Список заявок */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            {filter === 'ordered'
              ? 'Нет заказанных заявок.'
              : filter === 'done'
                ? 'Нет полученных заявок.'
                : isSenior
                  ? 'Заявок от мастеров пока нет.'
                  : 'Ты ещё не оставил заявок.'}
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="stagger-children">
              {filteredItems.map((r) => {
                const next = NEXT_STATUS[r.status]
                const NextIcon = NEXT_ICON[r.status]
                return (
                  <div
                    key={r.id}
                    className="p-4 border-b border-border last:border-b-0 space-y-2"
                  >
                    <div className="flex items-start gap-3">
                      {/* Аватар мастера — только для старшего */}
                      {isSenior && (
                        <div
                          className={`mt-0.5 h-9 w-9 shrink-0 ${masterAvatarClass(
                            r.master.color,
                          )} flex items-center justify-center text-[10px] font-mono font-bold text-white rounded-md`}
                        >
                          {initials(r.master.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        {isSenior && (
                          <div className="label-mono-sm mb-1">
                            {r.master.name}
                            {r.isMine && (
                              <span className="ml-1.5 text-ember">· ты</span>
                            )}
                          </div>
                        )}
                        <p className="body-sans text-sm break-words">{r.text}</p>
                        {findConsumableInText(r.text) && (
                          <div className="mt-1.5 inline-flex items-center gap-1 border border-border rounded-sm px-1.5 py-0.5 bg-muted/50">
                            <Tag className="h-2.5 w-2.5 text-muted-foreground" />
                            <span className="label-mono-sm text-muted-foreground">
                              {findConsumableInText(r.text)!.name}
                            </span>
                          </div>
                        )}
                        {r.grams != null && (
                          <p className="label-mono-sm mt-1">
                            Нужно: <span className="text-foreground font-bold">{r.grams}г</span>
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className={STATUS_STYLE[r.status]}>
                            {REQUEST_STATUS_LABELS[r.status]}
                          </Badge>
                          <span className="label-mono-sm">
                            {timeAgo(r.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isSenior && next && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] ml-12"
                        disabled={updatingId === r.id}
                        onClick={() => changeStatus(r.id, next)}
                      >
                        {updatingId === r.id ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <NextIcon className="h-3 w-3" />
                        )}
                        {NEXT_LABEL[r.status]}
                      </Button>
                    )}
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
