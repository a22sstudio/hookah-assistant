'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
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
import { toast } from 'sonner'
import {
  Package,
  Plus,
  Trash2,
  Pencil,
  Save,
  ClipboardPaste,
  Wand2,
  Loader2,
  CheckCircle2,
  Inbox,
  RefreshCw,
  AlertTriangle,
  X,
  Sparkles,
  Check,
} from 'lucide-react'

interface SupplyItem {
  id?: string
  itemType: 'TOBACCO' | 'CONSUMABLE'
  itemId?: string | null
  brand?: string | null
  line?: string | null
  flavor?: string | null
  name: string
  packGrams?: number | null
  quantity: number
  unit: string
  isNovelty?: boolean
  isMatch?: boolean
  rawText?: string
}

interface Supply {
  id: string
  status: 'DRAFT' | 'RECEIVED'
  note: string | null
  createdAt: string
  receivedAt: string | null
  itemsCount: number
  totalQuantity: number
  items: SupplyItem[]
}

interface Tobacco {
  id: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: number
  active?: boolean
}

interface Consumable {
  id: string
  name: string
  unit: string
  active?: boolean
}

interface SupplyPanelProps {
  refreshKey: number
  onRefresh: () => void
}

const STATUS_LABELS: Record<Supply['status'], string> = {
  DRAFT: 'Черновик',
  RECEIVED: 'Принято',
}

const STATUS_CLASSES: Record<Supply['status'], string> = {
  DRAFT: 'border-amber-500/30 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  RECEIVED: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function emptyItem(itemType: 'TOBACCO' | 'CONSUMABLE' = 'TOBACCO'): SupplyItem {
  return {
    itemType,
    brand: '',
    line: '',
    flavor: '',
    name: '',
    packGrams: null,
    quantity: 1,
    unit: 'шт',
    itemId: null,
    isNovelty: false,
    isMatch: false,
  }
}

// Нормализуем для case-insensitive сравнения
const norm = (s: string): string => (s || '').toUpperCase().replace(/\s+/g, ' ').trim()

export function SupplyPanel({ refreshKey, onRefresh }: SupplyPanelProps) {
  const [supplies, setSupplies] = useState<Supply[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'ALL' | 'DRAFT' | 'RECEIVED'>('ALL')

  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [consumables, setConsumables] = useState<Consumable[]>([])

  const [createOpen, setCreateOpen] = useState(false)
  const [mode, setMode] = useState<'MANUAL' | 'AI'>('MANUAL')
  const [items, setItems] = useState<SupplyItem[]>([emptyItem()])
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const [aiText, setAiText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])

  const [editSupply, setEditSupply] = useState<Supply | null>(null)
  const [editItems, setEditItems] = useState<SupplyItem[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [receiveResult, setReceiveResult] = useState<
    Array<{ name: string; ok: boolean; message: string; type: string }> | null
  >(null)

  const fetchSupplies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/supplies?status=${filter !== 'ALL' ? filter : ''}`).catch(() => null)
      if (!res) {
        toast.error('Сервер недоступен — проверьте подключение')
        setSupplies([])
        return
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        toast.error('Не удалось получить поставки: ' + (err.error || `HTTP ${res.status}`))
        setSupplies([])
        return
      }
      const data = await res.json().catch(() => ({ supplies: [] }))
      setSupplies(data.supplies ?? [])
    } catch (e) {
      toast.error('Не удалось получить поставки: ' + (e as Error).message)
      setSupplies([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  const fetchCatalogs = useCallback(async () => {
    try {
      const [tobRes, conRes] = await Promise.all([
        fetch('/api/tobaccos').catch(() => null),
        fetch('/api/consumables').catch(() => null),
      ])
      if (tobRes && tobRes.ok) {
        const d = await tobRes.json().catch(() => ({}))
        setTobaccos(d.tobaccos ?? [])
      }
      if (conRes && conRes.ok) {
        const d = await conRes.json().catch(() => ({}))
        setConsumables(d.consumables ?? [])
      }
    } catch {
      // silent — каталоги не критичны для отображения
    }
  }, [])

  useEffect(() => {
    fetchSupplies()
  }, [fetchSupplies, refreshKey])

  useEffect(() => {
    fetchCatalogs()
  }, [fetchCatalogs, refreshKey])

  const resetForm = () => {
    setItems([emptyItem()])
    setNote('')
    setAiText('')
    setWarnings([])
    setMode('MANUAL')
  }

  const handleCreate = async () => {
    if (items.length === 0) {
      toast.error('Добавьте хотя бы одну позицию')
      return
    }
    // Проверим что все валидны
    const invalidCount = items.filter((it) => {
      if (it.itemType === 'TOBACCO') return !it.brand || !it.flavor
      return !it.name
    }).length
    if (invalidCount > 0) {
      toast.error(`Заполните brand+flavor у ${invalidCount} поз. табака или имя расходника`)
      return
    }
    setSaving(true)
    try {
      // Чистим items — убираем rawText и isMatch/isNovelty (не нужны в БД)
      const cleanItems = items.map((it) => ({
        itemType: it.itemType,
        itemId: it.itemId ?? null,
        brand: it.brand ?? null,
        line: it.line ?? null,
        flavor: it.flavor ?? null,
        name: it.name,
        packGrams: it.packGrams ?? null,
        quantity: it.quantity,
        unit: it.unit,
      }))
      const res = await fetch('/api/supplies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, items: cleanItems }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      toast.success('Поставка создана')
      setCreateOpen(false)
      resetForm()
      fetchSupplies()
      onRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleParseText = async () => {
    if (!aiText.trim()) {
      toast.error('Вставьте текст накладной')
      return
    }
    setParsing(true)
    setWarnings([])
    try {
      const res = await fetch('/api/supplies/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiText, useLLM: true }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.items && data.items.length > 0) {
        setItems(data.items)
        setWarnings(data.warnings ?? [])
        toast.success(
          `Распознано ${data.items.length} поз. (${data.matchedCount} на складе, ${data.noveltyCount} новых)`,
        )
      } else {
        toast.error('Не удалось распознать позиции')
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const openEdit = (s: Supply) => {
    setEditSupply(s)
    setEditItems(s.items.map((it) => ({ ...it })))
  }

  const handleEditSave = async () => {
    if (!editSupply) return
    if (editItems.length === 0) {
      toast.error('Должна быть хотя бы одна позиция')
      return
    }
    setEditSaving(true)
    try {
      const cleanItems = editItems.map((it) => ({
        itemType: it.itemType,
        itemId: it.itemId ?? null,
        brand: it.brand ?? null,
        line: it.line ?? null,
        flavor: it.flavor ?? null,
        name: it.name,
        packGrams: it.packGrams ?? null,
        quantity: it.quantity,
        unit: it.unit,
      }))
      const res = await fetch('/api/supplies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editSupply.id, items: cleanItems }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      toast.success('Поставка обновлена')
      setEditSupply(null)
      fetchSupplies()
      onRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleReceive = async (s: Supply) => {
    setReceivingId(s.id)
    setReceiveResult(null)
    try {
      const res = await fetch(`/api/supplies/receive?id=${s.id}`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setReceiveResult(data.results)
      toast.success(data.message)
      fetchSupplies()
      onRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setReceivingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/supplies?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      toast.success('Поставка удалена')
      fetchSupplies()
      onRefresh()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const filtered = supplies

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-ember" />
          <h2 className="label-mono text-base sm:text-lg">Поставки</h2>
          <Badge variant="outline" className="label-mono-sm">
            {supplies.length}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Все</SelectItem>
              <SelectItem value="DRAFT">Черновики</SelectItem>
              <SelectItem value="RECEIVED">Принятые</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={fetchSupplies} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Dialog
            open={createOpen}
            onOpenChange={(o) => {
              setCreateOpen(o)
              if (!o) resetForm()
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Новая поставка</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[1000px] w-[95vw] h-[92vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden">
              <DialogHeader className="shrink-0">
                <DialogTitle className="label-mono">Новая поставка</DialogTitle>
              </DialogHeader>

              <div className="flex gap-2 border-b border-border pb-3 shrink-0">
                <Button
                  variant={mode === 'MANUAL' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('MANUAL')}
                >
                  <Pencil className="h-4 w-4" />
                  Ручной ввод
                </Button>
                <Button
                  variant={mode === 'AI' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('AI')}
                >
                  <Wand2 className="h-4 w-4" />
                  ИИ из текста
                </Button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-3">
                {mode === 'AI' && (
                  <div className="space-y-3 pb-2">
                    <div>
                      <Label className="text-xs">Текст накладной (Ctrl+V)</Label>
                      <Textarea
                        value={aiText}
                        onChange={(e) => setAiText(e.target.value)}
                        placeholder="Вставьте сюда текст накладной из PDF/Excel/почты..."
                        className="font-mono text-xs min-h-[150px] max-h-[250px]"
                      />
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button onClick={handleParseText} disabled={parsing} size="sm">
                        {parsing ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Wand2 className="h-4 w-4" />
                        )}
                        Распознать {parsing && '(ИИ думает...)'}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAiText('')
                          setWarnings([])
                        }}
                        size="sm"
                      >
                        <X className="h-4 w-4" />
                        Очистить
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            const text = await navigator.clipboard.readText()
                            if (text) {
                              setAiText(text)
                              toast.success('Вставлено из буфера')
                            } else {
                              toast.error('Буфер обмена пуст')
                            }
                          } catch {
                            toast.error('Не удалось прочитать буфер обмена')
                          }
                        }}
                      >
                        <ClipboardPaste className="h-4 w-4" />
                        Из буфера
                      </Button>
                    </div>
                    {warnings.length > 0 && (
                      <div className="space-y-1.5">
                        {warnings.map((w, i) => (
                          <div
                            key={i}
                            className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs"
                          >
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {items.length > 0 && mode === 'AI' && (
                      <div className="rounded-md border border-border p-2 bg-muted/30">
                        <div className="flex items-center justify-between px-1 pb-2">
                          <p className="text-xs text-muted-foreground">
                            Распознано {items.length} позиций — проверьте и поправьте:
                          </p>
                          <Badge variant="outline" className="label-mono-sm text-[10px]">
                            {items.filter((i) => i.isMatch).length} на складе ·{' '}
                            {items.filter((i) => i.isNovelty).length} новых
                          </Badge>
                        </div>
                        <ItemsEditor
                          items={items}
                          setItems={setItems}
                          tobaccos={tobaccos}
                          consumables={consumables}
                        />
                      </div>
                    )}
                  </div>
                )}

                {mode === 'MANUAL' && (
                  <ItemsEditor
                    items={items}
                    setItems={setItems}
                    tobaccos={tobaccos}
                    consumables={consumables}
                  />
                )}
              </div>

              <DialogFooter className="border-t border-border pt-3 shrink-0">
                <Input
                  placeholder="Заметка к поставке (необязательно)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleCreate} disabled={saving || items.length === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Сохранить поставку
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Список поставок */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <Inbox className="h-8 w-8 mb-2" />
          <p className="text-sm">Поставок пока нет</p>
          <p className="text-xs mt-1">Нажмите «Новая поставка» чтобы создать</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="flex items-center gap-3 p-3 sm:p-4 flex-wrap">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Badge className={`${STATUS_CLASSES[s.status]} label-mono-sm border`}>
                    {STATUS_LABELS[s.status]}
                  </Badge>
                  <div className="text-sm">
                    <span className="label-mono">{formatDate(s.createdAt)}</span>
                    {s.note && (
                      <span className="ml-2 text-muted-foreground text-xs">· {s.note}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="label-mono">{s.itemsCount} поз.</span>
                  <span className="label-mono">{s.totalQuantity} шт</span>
                </div>
                <div className="flex items-center gap-1">
                  {s.status === 'DRAFT' && (
                    <>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} title="Редактировать">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReceive(s)}
                        disabled={receivingId === s.id}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {receivingId === s.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Принять</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Удалить">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Удалить поставку?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Поставка от {formatDate(s.createdAt)} с {s.itemsCount} позициями будет удалена.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(s.id)}
                              className="bg-destructive hover:bg-destructive/90"
                            >
                              Удалить
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                  {s.status === 'RECEIVED' && s.receivedAt && (
                    <span className="text-xs text-muted-foreground">
                      принято: {formatDate(s.receivedAt)}
                    </span>
                  )}
                </div>
              </div>

              <SupplyItemsList items={s.items} />
            </div>
          ))}
        </div>
      )}

      {/* Модалка редактирования */}
      <Dialog open={!!editSupply} onOpenChange={(o) => !o && setEditSupply(null)}>
        <DialogContent className="max-w-[1000px] w-[95vw] h-[92vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="label-mono">
              Редактирование поставки
              {editSupply && ` · ${formatDate(editSupply.createdAt)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            <ItemsEditor
              items={editItems}
              setItems={setEditItems}
              tobaccos={tobaccos}
              consumables={consumables}
            />
          </div>
          <DialogFooter className="border-t border-border pt-3 shrink-0">
            <Button variant="outline" onClick={() => setEditSupply(null)}>
              Отмена
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модалка с результатом приёмки */}
      <Dialog open={!!receiveResult} onOpenChange={(o) => !o && setReceiveResult(null)}>
        <DialogContent className="max-w-[600px] w-[95vw] h-[80vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="label-mono">Результат приёмки</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            <div className="space-y-2">
              {receiveResult?.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                    r.ok
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-destructive/30 bg-destructive/5'
                  }`}
                >
                  {r.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.name}</p>
                    <p className="text-muted-foreground">{r.message}</p>
                  </div>
                  <Badge variant="outline" className="label-mono-sm shrink-0">
                    {r.type === 'TOBACCO' ? 'Табак' : 'Расходник'}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button onClick={() => setReceiveResult(null)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Список позиций поставки (read-only) ───
function SupplyItemsList({ items }: { items: SupplyItem[] }) {
  const [open, setOpen] = useState(false)
  if (items.length === 0) return null

  return (
    <div className="border-t border-border bg-muted/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 sm:px-4 py-2 flex items-center justify-between text-xs hover:bg-muted/40 transition-colors"
      >
        <span className="label-mono-sm text-muted-foreground">
          {open ? 'Скрыть позиции' : `Показать позиции (${items.length})`}
        </span>
        <span className="text-muted-foreground">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 sm:px-4 pb-3 max-h-72 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground label-mono-sm sticky top-0 bg-muted/80 backdrop-blur">
              <tr>
                <th className="text-left font-normal py-1.5 pr-2">Тип</th>
                <th className="text-left font-normal py-1.5 pr-2">Бренд / Линейка</th>
                <th className="text-left font-normal py-1.5 pr-2">Вкус / Название</th>
                <th className="text-right font-normal py-1.5 pr-2">Вес</th>
                <th className="text-right font-normal py-1.5">Кол-во</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} className="border-t border-border/50">
                  <td className="py-1.5 pr-2">
                    <Badge variant="outline" className="label-mono-sm text-[10px] py-0">
                      {it.itemType === 'TOBACCO' ? 'Т' : 'Р'}
                    </Badge>
                  </td>
                  <td className="py-1.5 pr-2 truncate max-w-[120px]">
                    {it.brand || '—'}
                    {it.line ? ` / ${it.line}` : ''}
                  </td>
                  <td className="py-1.5 pr-2 truncate max-w-[180px]">
                    {it.itemType === 'TOBACCO' ? it.flavor || it.name : it.name}
                  </td>
                  <td className="py-1.5 pr-2 text-right label-mono-sm">
                    {it.packGrams ? `${it.packGrams}г` : '—'}
                  </td>
                  <td className="py-1.5 pr-2 text-right label-mono-sm">
                    {it.quantity} {it.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Редактор позиций: структурированный ввод ───
function ItemsEditor({
  items,
  setItems,
  tobaccos,
  consumables,
}: {
  items: SupplyItem[]
  setItems: (updater: (prev: SupplyItem[]) => SupplyItem[]) => void
  tobaccos: Tobacco[]
  consumables: Consumable[]
}) {
  const update = (idx: number, patch: Partial<SupplyItem>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  const remove = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx))
  }
  const add = (itemType: 'TOBACCO' | 'CONSUMABLE') => {
    setItems((prev) => [...prev, emptyItem(itemType)])
  }

  // Существующие бренды (API /api/tobaccos уже возвращает только active=true,
  // поэтому повторный фильтр не нужен — он только ломает список, если active не пришёл)
  const brands = Array.from(
    new Set(tobaccos.map((t) => t.brand)),
  ).sort()

  // Для расходников: имена
  const consumableNames = consumables
    .map((c) => ({ id: c.id, name: c.name, unit: c.unit }))

  if (items.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Нет позиций. Добавьте ниже.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((it, idx) => {
        const isNovelty = it.isNovelty === true
        const isMatch = it.isMatch === true

        // Найти вкусы для текущего бренда (case-insensitive)
        const flavorsForBrand = it.brand
          ? tobaccos.filter((t) => norm(t.brand) === norm(it.brand!))
          : []

        // Является ли бренд существующим в базе (case-insensitive)
        const brandExistsInBase = it.brand && brands.some((b) => norm(b) === norm(it.brand!))

        return (
          <div
            key={idx}
            className={`rounded-md border p-2 transition-colors ${
              isNovelty
                ? 'border-amber-500/50 bg-amber-500/5 ring-1 ring-amber-500/20'
                : isMatch
                  ? 'border-emerald-500/30 bg-emerald-500/5'
                  : it.itemType === 'TOBACCO'
                    ? 'border-border bg-card'
                    : 'border-border bg-muted/30'
            }`}
          >
            {/* Шапка строки */}
            <div className="flex items-center gap-2 mb-2">
              <Select
                value={it.itemType}
                onValueChange={(v) => update(idx, { itemType: v as 'TOBACCO' | 'CONSUMABLE' })}
              >
                <SelectTrigger className="h-7 w-[80px] text-[11px] shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TOBACCO">Табак</SelectItem>
                  <SelectItem value="CONSUMABLE">Расход.</SelectItem>
                </SelectContent>
              </Select>

              {isMatch && (
                <Badge variant="outline" className="label-mono-sm text-[10px] py-0 border-emerald-500/40 text-emerald-600 bg-emerald-500/10">
                  <Check className="h-3 w-3 mr-1" />
                  На складе
                </Badge>
              )}
              {isNovelty && (
                <Badge variant="outline" className="label-mono-sm text-[10px] py-0 border-amber-500/40 text-amber-600 bg-amber-500/10">
                  <Sparkles className="h-3 w-3 mr-1" />
                  Новинка
                </Badge>
              )}

              <div className="flex-1" />

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => remove(idx)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>

            {it.itemType === 'TOBACCO' ? (
              <TobaccoItemEditor
                item={it}
                brands={brands}
                flavorsForBrand={flavorsForBrand}
                brandExistsInBase={!!brandExistsInBase}
                update={(patch) => update(idx, patch)}
              />
            ) : (
              <ConsumableItemEditor
                item={it}
                consumableNames={consumableNames}
                update={(patch) => update(idx, patch)}
              />
            )}
          </div>
        )
      })}

      <div className="flex gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => add('TOBACCO')}>
          <Plus className="h-4 w-4" />
          Табак
        </Button>
        <Button variant="outline" size="sm" onClick={() => add('CONSUMABLE')}>
          <Plus className="h-4 w-4" />
          Расходник
        </Button>
      </div>
    </div>
  )
}

// ─── Редактор табачной позиции ───
function TobaccoItemEditor({
  item,
  brands,
  flavorsForBrand,
  brandExistsInBase,
  update,
}: {
  item: SupplyItem
  brands: string[]
  flavorsForBrand: Tobacco[]
  brandExistsInBase: boolean
  update: (patch: Partial<SupplyItem>) => void
}) {
  // Если brand не в базе (или пустой) — показываем как "новый бренд"
  const isNewBrand = !!item.brand && !brandExistsInBase

  const onBrandSelect = (value: string) => {
    if (value === '__new__') {
      update({
        brand: '',
        line: '',
        flavor: '',
        itemId: null,
        isMatch: false,
        isNovelty: true,
      })
    } else {
      // Выбрали существующий бренд — сбрасываем вкус
      update({
        brand: value,
        line: '',
        flavor: '',
        itemId: null,
        isMatch: false,
        isNovelty: false,
      })
    }
  }

  const onFlavorSelect = (value: string) => {
    if (value === '__custom__') {
      // Выбрали "новый вкус" — оставляем flavor пустым для ввода
      update({
        flavor: '',
        itemId: null,
        isMatch: false,
        isNovelty: true,
      })
    } else {
      const t = flavorsForBrand.find((x) => x.id === value)
      if (t) {
        update({
          itemId: t.id,
          brand: t.brand,  // на случай если был кейс-несовпадение
          line: t.line,
          flavor: t.flavor,
          packGrams: item.packGrams ?? t.defaultJarGrams,
          isMatch: true,
          isNovelty: false,
        })
      }
    }
  }

  return (
    <div className="space-y-2">
      {/* Бренд + Вкус */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Бренд</Label>
          {isNewBrand && (
            <Input
              placeholder="Новый бренд"
              value={item.brand ?? ''}
              onChange={(e) =>
                update({
                  brand: e.target.value,
                  itemId: null,
                  isMatch: false,
                  isNovelty: true,
                })
              }
              className="h-8 text-xs mb-1"
            />
          )}
          <Select
            value={isNewBrand || !item.brand ? '__new__' : item.brand}
            onValueChange={onBrandSelect}
          >
            <SelectTrigger className="h-8 text-xs">
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

        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Линейка / вкус</Label>
          {brandExistsInBase && flavorsForBrand.length > 0 ? (
            <Select
              value={item.itemId && flavorsForBrand.some((t) => t.id === item.itemId) ? item.itemId : '__custom__'}
              onValueChange={onFlavorSelect}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Выберите вкус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__custom__">— новый вкус —</SelectItem>
                {flavorsForBrand.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.line ? `${t.line} / ` : ''}{t.flavor}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="Вкус, напр. Бархатный персик"
              value={item.flavor ?? ''}
              onChange={(e) =>
                update({
                  flavor: e.target.value,
                  itemId: null,
                  isMatch: false,
                  isNovelty: true,
                })
              }
              className="h-8 text-xs"
            />
          )}
        </div>
      </div>

      {/* Если выбран "новый вкус" для существующего бренда — показываем поле */}
      {brandExistsInBase && flavorsForBrand.length > 0 && item.itemId === null && !item.isMatch && (
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Новый вкус (нет на складе)</Label>
          <Input
            placeholder="Например: Бархатный персик"
            value={item.flavor ?? ''}
            onChange={(e) =>
              update({
                flavor: e.target.value,
                itemId: null,
                isMatch: false,
                isNovelty: true,
              })
            }
            className="h-8 text-xs"
          />
        </div>
      )}

      {/* Линейка + Вес + Кол-во + Ед. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Линейка (опц.)</Label>
          <Input
            placeholder="Core, Medium…"
            value={item.line ?? ''}
            onChange={(e) => update({ line: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Вес (г)</Label>
          <Input
            type="number"
            placeholder="250"
            value={item.packGrams ?? ''}
            onChange={(e) =>
              update({ packGrams: e.target.value ? parseInt(e.target.value, 10) : null })
            }
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Кол-во</Label>
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => update({ quantity: parseInt(e.target.value, 10) || 0 })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Ед.</Label>
          <Input
            value={item.unit}
            onChange={(e) => update({ unit: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  )
}

// ─── Редактор позиции расходника ───
function ConsumableItemEditor({
  item,
  consumableNames,
  update,
}: {
  item: SupplyItem
  consumableNames: Array<{ id: string; name: string; unit: string }>
  update: (patch: Partial<SupplyItem>) => void
}) {
  const isNewName = !!item.name && !consumableNames.some((c) => norm(c.name) === norm(item.name!))

  const onConsumableSelect = (value: string) => {
    if (value === '__new__') {
      update({
        name: '',
        itemId: null,
        isMatch: false,
        isNovelty: true,
      })
    } else {
      const c = consumableNames.find((x) => x.id === value)
      if (c) {
        update({
          itemId: c.id,
          name: c.name,
          unit: c.unit,
          isMatch: true,
          isNovelty: false,
        })
      }
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px] text-muted-foreground label-mono-sm">Расходник</Label>
        {isNewName && (
          <Input
            placeholder="Новый расходник"
            value={item.name}
            onChange={(e) =>
              update({
                name: e.target.value,
                itemId: null,
                isMatch: false,
                isNovelty: true,
              })
            }
            className="h-8 text-xs mb-1"
          />
        )}
        <Select
          value={isNewName || !item.itemId ? '__new__' : item.itemId}
          onValueChange={onConsumableSelect}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Выберите расходник" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__new__">— новый расходник —</SelectItem>
            {consumableNames.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Кол-во</Label>
          <Input
            type="number"
            value={item.quantity}
            onChange={(e) => update({ quantity: parseInt(e.target.value, 10) || 0 })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Ед. изм</Label>
          <Input
            value={item.unit}
            onChange={(e) => update({ unit: e.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground label-mono-sm">Вес/объём (опц.)</Label>
          <Input
            type="number"
            placeholder="1000"
            value={item.packGrams ?? ''}
            onChange={(e) =>
              update({ packGrams: e.target.value ? parseInt(e.target.value, 10) : null })
            }
            className="h-8 text-xs"
          />
        </div>
      </div>
    </div>
  )
}
