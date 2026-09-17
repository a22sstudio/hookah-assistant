'use client'

import { useEffect, useState, useCallback } from 'react'
import { Tobacco } from '@/lib/types'
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
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { Plus, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface TobaccosManagerProps {
  refreshKey: number
  onRefresh: () => void
}

export function TobaccosManager({ refreshKey, onRefresh }: TobaccosManagerProps) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    brand: '',
    line: '',
    flavor: '',
    defaultJarGrams: 250,
    thresholdGrams: 70,
    notes: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tobaccos')
      const data = await res.json()
      setTobaccos(data.tobaccos ?? [])
    } catch {
      toast.error('Не удалось загрузить справочник')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const handleCreate = async () => {
    if (!form.brand || !form.line || !form.flavor) {
      toast.error('Заполните бренд, линейку и вкус')
      return
    }
    try {
      const res = await fetch('/api/tobaccos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success('Добавлено в справочник')
        setForm({
          brand: '',
          line: '',
          flavor: '',
          defaultJarGrams: 250,
          thresholdGrams: 70,
          notes: '',
        })
        setDialogOpen(false)
        load()
        onRefresh()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Ошибка')
      }
    } catch {
      toast.error('Ошибка сети')
    }
  }

  return (
    <div className="space-y-6">
      {/* Заголовок */}
      <div className="flex items-end justify-between gap-4 border-b border-border pb-3 flex-wrap">
        <div className="min-w-0">
          <span className="label-mono">Каталог</span>
          <h2
            className="heading-mono text-foreground leading-none mt-1"
            style={{ fontSize: 'clamp(24px, 4vw, 36px)' }}
          >
            Справочник табаков
          </h2>
          <p className="body-sans text-xs text-muted-foreground mt-2">
            Гибридный режим: добавляйте вручную. Бот тоже учится распознавать с накладных.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" onClick={load} title="Обновить">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4" /> Добавить
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Новый табак</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="brand">Бренд *</Label>
                    <Input
                      id="brand"
                      placeholder="Darkside"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="line">Линейка *</Label>
                    <Input
                      id="line"
                      placeholder="Supernova"
                      value={form.line}
                      onChange={(e) => setForm({ ...form, line: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="flavor">Вкус *</Label>
                  <Input
                    id="flavor"
                    placeholder="Ice Grape"
                    value={form.flavor}
                    onChange={(e) => setForm({ ...form, flavor: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="jar">Вес банки (г)</Label>
                    <Input
                      id="jar"
                      type="number"
                      value={form.defaultJarGrams}
                      onChange={(e) =>
                        setForm({ ...form, defaultJarGrams: Number(e.target.value) })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="threshold">Порог «мало» (г)</Label>
                    <Input
                      id="threshold"
                      type="number"
                      value={form.thresholdGrams}
                      onChange={(e) =>
                        setForm({ ...form, thresholdGrams: Number(e.target.value) })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="notes">Заметка</Label>
                  <Input
                    id="notes"
                    placeholder="необязательно"
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Отмена</Button>
                </DialogClose>
                <Button onClick={handleCreate}>Создать</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Список */}
      <div className="border border-border rounded-md shadow-sm-soft">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground label-mono">
            Загрузка...
          </div>
        ) : tobaccos.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm body-sans">
            Справочник пуст.
          </div>
        ) : (
          <ScrollArea className="max-h-[65vh]">
            <div className="stagger-children">
              {tobaccos.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-4 p-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-base transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono uppercase text-sm font-bold tracking-tight truncate">
                        {t.brand}
                      </span>
                      <span className="font-sans text-xs text-muted-foreground truncate">
                        · {t.line}
                      </span>
                      {t.isLow && (
                        <Badge className="border-ember text-ember bg-transparent">
                          мало
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-1 body-sans">
                      {t.flavor}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="label-mono-sm">
                      банка: <span className="font-bold text-foreground">{t.defaultJarGrams}г</span>
                    </div>
                    <div className="label-mono-sm">
                      порог: <span className="font-bold text-foreground">{t.thresholdGrams}г</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
