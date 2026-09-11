'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  Plus,
  RefreshCw,
  Loader2,
  Check,
  X,
  Pencil,
  Send,
  KeyRound,
  Hash,
} from 'lucide-react'
import { toast } from 'sonner'
import { masterAvatarClass, masterColorClasses, initials } from '@/lib/master-utils'

interface MasterRow {
  id: string
  name: string
  role: 'SENIOR' | 'REGULAR'
  color: string
  pin: string
  telegramId: string | null
}

interface MastersManagerProps {
  refreshKey: number
  onRefresh: () => void
}

const COLOR_OPTIONS = [
  { value: 'emerald', label: 'Изумруд', className: 'bg-emerald-500' },
  { value: 'teal', label: 'Бирюза', className: 'bg-teal-500' },
  { value: 'amber', label: 'Янтарь', className: 'bg-amber-500' },
  { value: 'sky', label: 'Небо', className: 'bg-sky-500' },
  { value: 'violet', label: 'Фиолет', className: 'bg-violet-500' },
  { value: 'rose', label: 'Роза', className: 'bg-rose-500' },
]

function randomPinSuggestion(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

export function MastersManager({ refreshKey, onRefresh }: MastersManagerProps) {
  const [masters, setMasters] = useState<MasterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  // Форма создания мастера
  const [form, setForm] = useState({
    name: '',
    role: 'REGULAR' as 'SENIOR' | 'REGULAR',
    pin: '',
    color: 'emerald',
    telegramId: '',
  })

  // Локальное состояние inline-редактирования telegramId (по masterId)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/masters')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error || 'Не удалось загрузить мастеров')
        setMasters([])
        return
      }
      const data = await res.json()
      setMasters(data.masters ?? [])
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const openCreateDialog = () => {
    setForm({
      name: '',
      role: 'REGULAR',
      pin: randomPinSuggestion(),
      color: 'emerald',
      telegramId: '',
    })
    setDialogOpen(true)
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      toast.error('Введите имя мастера')
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          role: form.role,
          pin: form.pin.trim() || undefined,
          color: form.color,
          telegramId: form.telegramId.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Ошибка создания')
        return
      }
      toast.success(data.message || `Мастер «${form.name.trim()}» создан`)
      setDialogOpen(false)
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setCreating(false)
    }
  }

  // Inline-редактирование Telegram ID
  const startEdit = (m: MasterRow) => {
    setEditingId(m.id)
    setEditValue(m.telegramId ?? '')
  }
  const cancelEdit = () => {
    setEditingId(null)
    setEditValue('')
  }

  const saveTelegram = async (masterId: string) => {
    setSavingId(masterId)
    try {
      const res = await fetch('/api/masters', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: masterId,
          telegramId: editValue.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Не удалось сохранить')
        return
      }
      toast.success(data.message || 'Сохранено')
      cancelEdit()
      await load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setSavingId(null)
    }
  }

  const stats = {
    total: masters.length,
    senior: masters.filter((m) => m.role === 'SENIOR').length,
    regular: masters.filter((m) => m.role === 'REGULAR').length,
    boundTg: masters.filter((m) => !!m.telegramId).length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div className="min-w-0">
          <span className="label-mono">Команда</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Мастера
          </h2>
          <p className="body-sans text-xs text-muted-foreground mt-2">
            Управление командой: PIN-коды, роли и привязка к Telegram.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" onClick={load} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="h-4 w-4" /> Добавить мастера
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новый мастер</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="m-name">Имя *</Label>
                  <Input
                    id="m-name"
                    placeholder="Иван"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="m-role">Роль</Label>
                    <Select
                      value={form.role}
                      onValueChange={(v) =>
                        setForm({ ...form, role: v as 'SENIOR' | 'REGULAR' })
                      }
                    >
                      <SelectTrigger id="m-role" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="REGULAR">мастер</SelectItem>
                        <SelectItem value="SENIOR">старший</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-pin">PIN</Label>
                    <div className="flex gap-2">
                      <Input
                        id="m-pin"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="1234"
                        value={form.pin}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            pin: e.target.value.replace(/\D/g, '').slice(0, 4),
                          })
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        title="Сгенерировать PIN"
                        onClick={() => setForm({ ...form, pin: randomPinSuggestion() })}
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="m-color">Цвет аватара</Label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setForm({ ...form, color: c.value })}
                        className={`h-8 w-8 ${c.className} rounded-md transition-base ${
                          form.color === c.value
                            ? 'ring-2 ring-offset-2 ring-foreground scale-110'
                            : 'hover:scale-105 opacity-80'
                        }`}
                        title={c.label}
                        aria-label={c.label}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="m-tg">Telegram ID (необязательно)</Label>
                  <Input
                    id="m-tg"
                    inputMode="numeric"
                    placeholder="123456789"
                    value={form.telegramId}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        telegramId: e.target.value.replace(/[^\d]/g, ''),
                      })
                    }
                  />
                  <p className="label-mono-sm">
                    Мастер может привязать себя сам через бота: /claim PIN
                  </p>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Отмена</Button>
                </DialogClose>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Создание...
                    </>
                  ) : (
                    'Создать'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Сводка */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="border border-border rounded-md p-4 shadow-sm-soft">
          <div className="label-mono mb-2">Всего</div>
          <div className="text-3xl font-mono font-bold tabular text-foreground">{stats.total}</div>
        </div>
        <div className="border border-border rounded-md p-4 shadow-sm-soft">
          <div className="label-mono mb-2">Старших</div>
          <div className="text-3xl font-mono font-bold tabular text-foreground">{stats.senior}</div>
        </div>
        <div className="border border-border rounded-md p-4 shadow-sm-soft">
          <div className="label-mono mb-2">Мастеров</div>
          <div className="text-3xl font-mono font-bold tabular text-foreground">{stats.regular}</div>
        </div>
        <div className="border border-border rounded-md p-4 shadow-sm-soft">
          <div className="label-mono mb-2">С Telegram</div>
          <div className="text-3xl font-mono font-bold tabular text-foreground">{stats.boundTg}</div>
        </div>
      </div>

      {/* Список мастеров */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Загрузка...
          </div>
        ) : masters.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground text-sm body-sans">
            <Users className="h-6 w-6 mx-auto mb-3 text-muted-foreground/70" />
            Мастеров пока нет.
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh]">
            <div className="stagger-children">
              {masters.map((m) => {
                const isEditing = editingId === m.id
                const isSaving = savingId === m.id
                const colors = masterColorClasses(m.color)
                return (
                  <div
                    key={m.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-border last:border-b-0 hover:bg-muted/40 transition-base transition-colors"
                  >
                    {/* Аватар + имя + роль */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div
                        className={`h-10 w-10 shrink-0 ${masterAvatarClass(
                          m.color,
                        )} flex items-center justify-center text-xs font-mono font-bold uppercase text-white border-2 ${colors.ring}/30 rounded-md`}
                      >
                        {initials(m.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-mono uppercase text-sm font-bold tracking-tight truncate text-foreground">
                            {m.name}
                          </span>
                          {m.role === 'SENIOR' ? (
                            <Badge className="border-ember text-ember bg-transparent">
                              старший
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              мастер
                            </Badge>
                          )}
                        </div>
                        {/* PIN + Telegram ID строка */}
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1 label-mono-sm">
                            <KeyRound className="h-3 w-3" />
                            <span className="font-bold text-foreground">
                              {m.pin}
                            </span>
                          </span>
                          {!isEditing && (
                            <span className="flex items-center gap-1 label-mono-sm">
                              <Hash className="h-3 w-3" />
                              {m.telegramId ? (
                                <span className="font-bold text-foreground">
                                  {m.telegramId}
                                </span>
                              ) : (
                                <span className="italic text-muted-foreground/70">
                                  не привязан
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Действия */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isEditing ? (
                        <>
                          <Input
                            inputMode="numeric"
                            placeholder="123456789"
                            value={editValue}
                            onChange={(e) =>
                              setEditValue(
                                e.target.value.replace(/[^\d]/g, ''),
                              )
                            }
                            className="h-8 w-40 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') void saveTelegram(m.id)
                              if (e.key === 'Escape') cancelEdit()
                            }}
                          />
                          <Button
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => void saveTelegram(m.id)}
                            disabled={isSaving}
                            title="Сохранить"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={cancelEdit}
                            disabled={isSaving}
                            title="Отмена"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {!m.telegramId ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-[11px]"
                              onClick={() => startEdit(m)}
                            >
                              <Send className="h-3 w-3" /> привязать
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => startEdit(m)}
                              title="Изменить Telegram ID"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      <p className="label-mono-sm text-center">
        Мастера также могут привязать Telegram сами: откройте{' '}
        <span className="font-bold text-foreground">@Defowork_bot</span> и отправьте{' '}
        <span className="font-bold text-foreground">/claim ВАШ_PIN</span>
      </p>
    </div>
  )
}
