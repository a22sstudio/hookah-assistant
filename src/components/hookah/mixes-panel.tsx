'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  Beaker,
  Plus,
  Trash2,
  Pencil,
  Save,
  Loader2,
  RefreshCw,
  Inbox,
  X,
} from 'lucide-react'
import { masterAvatarClass, initials } from '@/lib/master-utils'

interface MixItem {
  id?: string
  tobaccoId: string
  brand: string
  line: string
  flavor: string
  percent: number
}

interface Mix {
  id: string
  name: string
  description: string | null
  author: { id: string; name: string; color: string }
  isMine: boolean
  canEdit: boolean
  items: MixItem[]
  createdAt: string
  updatedAt: string
}

interface TobaccoOption {
  id: string
  brand: string
  line: string
  flavor: string
}

interface MixesPanelProps {
  role: 'SENIOR' | 'REGULAR'
  masterId: string
  refreshKey: number
  onRefresh: () => void
}

const norm = (s: string): string => (s || '').toUpperCase().replace(/\s+/g, ' ').trim()

export function MixesPanel({ role, masterId, refreshKey, onRefresh }: MixesPanelProps) {
  const [mixes, setMixes] = useState<Mix[]>([])
  const [tobaccos, setTobaccos] = useState<TobaccoOption[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingMix, setEditingMix] = useState<Mix | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    description: '',
    items: [] as Array<{ tobaccoId: string; percent: number }>,
  })

  // Выбор бренда → табака
  const [selectedBrand, setSelectedBrand] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mixesRes, tobRes] = await Promise.all([
        fetch('/api/mixes'),
        fetch('/api/tobaccos'),
      ])
      if (mixesRes.ok) {
        const d = await mixesRes.json()
        setMixes(d.mixes ?? [])
      }
      if (tobRes.ok) {
        const d = await tobRes.json()
        setTobaccos(
          (d.tobaccos ?? []).map((t: { id: string; brand: string; line: string; flavor: string }) => ({
            id: t.id,
            brand: t.brand,
            line: t.line,
            flavor: t.flavor,
          })),
        )
      }
    } catch {
      toast.error('Не удалось загрузить миксы')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Список брендов
  const brands = useMemo(() => {
    const set = new Set(tobaccos.map((t) => t.brand))
    return Array.from(set).sort()
  }, [tobaccos])

  // Табаки выбранного бренда
  const tobaccosForBrand = useMemo(() => {
    if (!selectedBrand) return []
    return tobaccos.filter((t) => norm(t.brand) === norm(selectedBrand))
  }, [tobaccos, selectedBrand])

  const openCreate = () => {
    setEditingMix(null)
    setForm({ name: '', description: '', items: [] })
    setSelectedBrand('')
    setDialogOpen(true)
  }

  const openEdit = (m: Mix) => {
    setEditingMix(m)
    setForm({
      name: m.name,
      description: m.description ?? '',
      items: m.items.map((it) => ({ tobaccoId: it.tobaccoId, percent: it.percent })),
    })
    setSelectedBrand('')
    setDialogOpen(true)
  }

  const addItem = (tobaccoId: string) => {
    if (form.items.some((it) => it.tobaccoId === tobaccoId)) {
      toast.error('Этот табак уже в миксе')
      return
    }
    // Максимальный процент = 100 - текущая сумма
    const remaining = 100 - totalPercent
    const defaultPercent = Math.min(50, Math.max(1, remaining))
    if (defaultPercent <= 0) {
      toast.error('Сумма процентов уже 100%')
      return
    }
    setForm({ ...form, items: [...form.items, { tobaccoId, percent: defaultPercent }] })
  }

  const removeItem = (idx: number) => {
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) })
  }

  const updatePercent = (idx: number, percent: number) => {
    const clamped = Math.max(1, Math.min(100, percent))
    const items = [...form.items]
    const newTotal = items.reduce((sum, it, i) => (i === idx ? sum + clamped : sum + it.percent), 0)
    if (newTotal > 100) {
      toast.error('Сумма процентов не может превышать 100%')
      return
    }
    items[idx] = { ...items[idx], percent: clamped }
    setForm({ ...form, items })
  }

  const totalPercent = form.items.reduce((sum, it) => sum + it.percent, 0)

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Введите название микса')
      return
    }
    if (form.items.length === 0) {
      toast.error('Добавьте хотя бы один табак')
      return
    }
    if (totalPercent > 100) {
      toast.error('Сумма процентов превышает 100%')
      return
    }

    setSaving(true)
    try {
      const method = editingMix ? 'PATCH' : 'POST'
      const body = editingMix
        ? { id: editingMix.id, ...form }
        : form

      const res = await fetch('/api/mixes', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({ error: 'Неизвестная ошибка' }))
      if (!res.ok) {
        toast.error(data.error || 'Ошибка')
        return
      }
      toast.success(data.message || (editingMix ? 'Микс обновлён' : 'Микс создан'))
      setDialogOpen(false)
      setEditingMix(null)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/mixes?id=${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({ error: 'Ошибка' }))
      if (!res.ok) {
        toast.error(data.error || 'Ошибка')
        return
      }
      toast.success(data.message || 'Микс удалён')
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    }
  }

  const getTobacco = (id: string) => tobaccos.find((t) => t.id === id)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Beaker className="h-5 w-5 text-ember" />
          <h2 className="label-mono text-base sm:text-lg">Миксы</h2>
          <Badge variant="outline" className="label-mono-sm">
            {mixes.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Создать микс</span>
          </Button>
        </div>
      </div>

      {/* Список миксов */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : mixes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
          <Inbox className="h-8 w-8 mb-2" />
          <p className="text-sm">Миксов пока нет</p>
          <p className="text-xs mt-1">Нажмите «Создать микс» чтобы добавить</p>
        </div>
      ) : (
        <div className="space-y-3">
          {mixes.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-mono font-bold text-sm truncate">{m.name}</h3>
                    {m.description && (
                      <p className="text-xs text-muted-foreground mt-1">{m.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div
                      className={`h-6 w-6 ${masterAvatarClass(m.author.color)} flex items-center justify-center text-[8px] font-mono font-bold text-white rounded-md`}
                      title={`Автор: ${m.author.name}`}
                    >
                      {initials(m.author.name)}
                    </div>
                    {m.canEdit && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)} title="Редактировать">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Удалить">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Удалить микс «{m.name}»?</AlertDialogTitle>
                              <AlertDialogDescription>Это действие нельзя отменить.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Отмена</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(m.id)}
                                className="bg-destructive hover:bg-destructive/90"
                              >
                                Удалить
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {m.items.map((it, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="flex-1 min-w-0">
                        <span className="font-sans">
                          {it.brand} {it.line ? it.line + ' ' : ''}{it.flavor}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-ember" style={{ width: `${it.percent}%` }} />
                        </div>
                        <span className="label-mono-sm tabular w-8 text-right">{it.percent}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                  <span className="label-mono-sm text-muted-foreground">Автор: {m.author.name}</span>
                  {m.isMine && (
                    <Badge variant="outline" className="label-mono-sm text-[10px] py-0 border-ember text-ember">твой</Badge>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Модалка создания/редактирования */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditingMix(null) }}>
        <DialogContent className="max-w-[600px] w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="label-mono">
              {editingMix ? 'Редактировать микс' : 'Новый микс'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1 space-y-3">
            {/* Название */}
            <div>
              <Label className="text-xs">Название *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Например: Летний бриз"
                autoFocus
              />
            </div>

            {/* Описание */}
            <div>
              <Label className="text-xs">Описание (необязательно)</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Свежий, сладкий микс для летнего вечера..."
                className="min-h-[60px] text-xs"
              />
            </div>

            {/* Шаг 1: Выбор бренда */}
            <div>
              <Label className="text-xs">Шаг 1: Выберите бренд</Label>
              <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Все бренды" />
                </SelectTrigger>
                <SelectContent>
                  {brands.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Шаг 2: Выбор табака из бренда */}
            {selectedBrand && (
              <div>
                <Label className="text-xs">Шаг 2: Добавить табак из {selectedBrand}</Label>
                <Select onValueChange={addItem}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="+ Выбрать табак" />
                  </SelectTrigger>
                  <SelectContent>
                    {tobaccosForBrand.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.line ? t.line + ' / ' : ''}{t.flavor}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Список добавленных табаков */}
            {form.items.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Состав микса</Label>
                {form.items.map((it, idx) => {
                  const t = getTobacco(it.tobaccoId)
                  return (
                    <div key={idx} className="flex items-center gap-2 rounded-md border border-border p-2 bg-card">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-sans truncate">
                          {t ? `${t.brand} ${t.line ? t.line + ' ' : ''}${t.flavor}` : 'Неизвестный табак'}
                        </p>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={it.percent}
                        onChange={(e) => updatePercent(idx, parseInt(e.target.value) || 0)}
                        className="h-7 w-16 text-xs"
                      />
                      <span className="text-xs">%</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeItem(idx)}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )
                })}
                <div className="flex items-center justify-between text-xs px-2">
                  <span className="label-mono-sm text-muted-foreground">Сумма:</span>
                  <span className={`label-mono-sm font-bold ${totalPercent === 100 ? 'text-emerald-500' : totalPercent < 100 ? 'text-amber-500' : 'text-destructive'}`}>
                    {totalPercent}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-3 shrink-0">
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditingMix(null) }}>
              Отмена
            </Button>
            <Button onClick={handleSave} disabled={saving || totalPercent > 100}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingMix ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
