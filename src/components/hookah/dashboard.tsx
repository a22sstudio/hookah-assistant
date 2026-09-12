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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Settings2,
  X,
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

// ─── Cascading form state ────────────────────────────────────────
// brandSelect: '' | existing brand name | '__new__'
// lineSelect : '' | existing line name | '__new__' | '__none__'
// (для нового бренда — Select по линейкам не показывается, только Input)
interface EditFormState {
  id?: string
  brandSelect: string
  brandInput: string
  lineSelect: string
  lineInput: string
  flavor: string
  defaultJarGrams: string
  thresholdGrams: string
  currentGrams: string
  notes: string
}

const EMPTY_FORM: EditFormState = {
  brandSelect: '',
  brandInput: '',
  lineSelect: '',
  lineInput: '',
  flavor: '',
  defaultJarGrams: '250',
  thresholdGrams: '70',
  currentGrams: '0',
  notes: '',
}

// Сентинелы для каскадных Select
const NEW_BRAND = '__new_brand__'
const NEW_LINE = '__new_line__'
const NONE_LINE = '__none_line__'

// ─── Brand edit dialog state ─────────────────────────────────────
interface BrandLineEdit {
  id: string // стаб-ид для React key
  original: string // исходное имя линейки ('' для новых)
  value: string // текущее значение в инпуте
  isNew: boolean // true если это добавленное поле
  removed: boolean // true если пользователь нажал × (только для !isNew)
}

interface BrandEditState {
  brand: string // исходный бренд
  name: string // редактируемое имя бренда
  lines: BrandLineEdit[]
}

type FilterChip = 'all' | 'low' | 'ok'

export function Dashboard({ refreshKey, onRefresh, readOnly = false }: DashboardProps) {
  const [tobaccos, setTobaccos] = useState<Tobacco[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterChip>('all')
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [linesMap, setLinesMap] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [orderingId, setOrderingId] = useState<string | null>(null)
  const [expandedBrands, setExpandedBrands] = useState<string[]>([])
  const [brandEdit, setBrandEdit] = useState<BrandEditState | null>(null)
  const [brandEditSaving, setBrandEditSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tobaccosRes, linesRes] = await Promise.all([
        fetch('/api/tobaccos'),
        fetch('/api/tobaccos/lines'),
      ])
      const tobaccosData = await tobaccosRes.json()
      const linesData = await linesRes.json()
      setTobaccos(tobaccosData.tobaccos ?? [])
      setLinesMap(linesData.lines ?? {})
    } catch {
      toast.error('Не удалось загрузить остатки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Существующие бренды (для Select в форме)
  const existingBrands = useMemo(
    () => Array.from(new Set(tobaccos.map((t) => t.brand))).sort((a, b) => a.localeCompare(b)),
    [tobaccos],
  )

  // Существующие линейки конкретного бренда
  const linesForBrand = useCallback(
    (brand: string) =>
      Array.from(
        new Set([
          // Линии из табаков
          ...tobaccos
            .filter((t) => t.brand === brand && t.line && t.line.trim() !== '')
            .map((t) => t.line),
          // Линии из справочника TobaccoLine
          ...(linesMap[brand] ?? []),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [tobaccos, linesMap],
  )

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
  }, [allBrandsKey])

  const lowCount = tobaccos.filter((t) => t.isLow).length
  const totalGrams = tobaccos.reduce((sum, t) => sum + t.currentGrams, 0)

  // ─── Derived form values ──────────────────────────────────────
  const formBrand = useMemo(() => {
    if (!editForm) return ''
    return editForm.brandSelect === NEW_BRAND
      ? editForm.brandInput.trim()
      : editForm.brandSelect
  }, [editForm])

  const formLine = useMemo(() => {
    if (!editForm) return ''
    // Для нового бренда — просто Input
    if (editForm.brandSelect === NEW_BRAND) return editForm.lineInput.trim()
    // Для существующего бренда — Select
    if (editForm.lineSelect === NEW_LINE) return editForm.lineInput.trim()
    if (editForm.lineSelect === NONE_LINE) return ''
    return editForm.lineSelect // существующая линейка или '' (placeholder)
  }, [editForm])

  // Линейки для текущего выбранного бренда (если бренд существующий)
  const formLinesForBrand = useMemo(() => {
    if (!editForm || editForm.brandSelect === '' || editForm.brandSelect === NEW_BRAND) return []
    return linesForBrand(editForm.brandSelect)
  }, [editForm, linesForBrand])

  const openEdit = (t: Tobacco) => {
    if (readOnly) return
    // Если бренд существует в справочнике — выбираем его, иначе показываем как новый
    const isExistingBrand = existingBrands.includes(t.brand)
    const brandSelect = isExistingBrand ? t.brand : NEW_BRAND
    const brandInput = isExistingBrand ? '' : t.brand

    // Линейка: если пустая → NONE_LINE; если существует в списке линий бренда → её; иначе новая
    let lineSelect = ''
    let lineInput = ''
    if (t.line && t.line.trim() !== '') {
      const lines = linesForBrand(t.brand)
      if (lines.includes(t.line)) {
        lineSelect = t.line
      } else {
        lineSelect = NEW_LINE
        lineInput = t.line
      }
    } else {
      lineSelect = NONE_LINE
    }

    setEditForm({
      id: t.id,
      brandSelect,
      brandInput,
      lineSelect,
      lineInput,
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
    const brand = formBrand
    const line = formLine
    const flavor = editForm.flavor.trim()

    if (!brand) {
      toast.error('Укажите бренд')
      return
    }
    if (!flavor) {
      toast.error('Укажите вкус')
      return
    }

    setSaving(true)
    try {
      const isEdit = Boolean(editForm.id)
      const body = {
        ...(isEdit ? { id: editForm.id } : {}),
        brand,
        line,
        flavor,
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

  // ─── Brand edit dialog ─────────────────────────────────────────
  const openBrandEdit = (brand: string) => {
    if (readOnly) return
    const lines = linesForBrand(brand).map((l) => ({
      id: `line-${l}`,
      original: l,
      value: l,
      isNew: false,
      removed: false,
    }))
    setBrandEdit({ brand, name: brand, lines })
  }

  const closeBrandEdit = () => {
    if (brandEditSaving) return
    setBrandEdit(null)
  }

  const addBrandLineEdit = () => {
    if (!brandEdit) return
    setBrandEdit({
      ...brandEdit,
      lines: [
        ...brandEdit.lines,
        {
          id: `new-${Date.now()}-${brandEdit.lines.length}`,
          original: '',
          value: '',
          isNew: true,
          removed: false,
        },
      ],
    })
  }

  const removeBrandLineEdit = (id: string) => {
    if (!brandEdit) return
    setBrandEdit({
      ...brandEdit,
      lines: brandEdit.lines.map((l) =>
        l.id === id ? { ...l, removed: true } : l,
      ),
    })
  }

  const updateBrandLineEdit = (id: string, value: string) => {
    if (!brandEdit) return
    setBrandEdit({
      ...brandEdit,
      lines: brandEdit.lines.map((l) =>
        l.id === id ? { ...l, value } : l,
      ),
    })
  }

  const saveBrandEdit = async () => {
    if (!brandEdit) return
    setBrandEditSaving(true)
    try {
      const newBrandName = brandEdit.name.trim()
      const oldBrandName = brandEdit.brand
      const renamed = newBrandName !== oldBrandName && newBrandName !== ''

      // Если бренд переименован — сначала переименовываем бренд,
      // дальше линейку правим уже по новому имени.
      const effectiveBrand = renamed ? newBrandName : oldBrandName

      if (renamed) {
        const r = await fetch('/api/tobaccos/brand', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldBrand: oldBrandName, newBrand: newBrandName }),
        })
        const d = await r.json()
        if (!r.ok) {
          toast.error(d.error || 'Ошибка переименования бренда')
          setBrandEditSaving(false)
          return
        }
      }

      // Обрабатываем линейки (используем effectiveBrand — новое имя бренда,
      // потому что табаки уже под новым именем, если переименование было).
      // Порядок важен: сначала очищаем (×), потом переименовываем, чтобы избежать
      // конфликтов при пересечении имён.
      const sortedLines = [...brandEdit.lines].sort((a, b) => {
        // removed сначала, потом isNew (игнорируем), потом переименования
        if (a.removed && !b.removed) return -1
        if (!a.removed && b.removed) return 1
        return 0
      })

      let successCount = 0
      let errorCount = 0

      for (const line of sortedLines) {
        // Новые линейки → создаём через API
        if (line.isNew) {
          const newName = line.value.trim()
          if (!newName) continue // пустые игнорируем
          const r = await fetch('/api/tobaccos/lines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand: effectiveBrand, name: newName }),
          })
          if (r.ok) successCount++
          else errorCount++
          continue
        }
        // Удалённые → удаляем линейку из справочника + очищаем у табаков
        if (line.removed) {
          // Очищаем у табаков
          const r = await fetch('/api/tobaccos/line', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              brand: effectiveBrand,
              oldLine: line.original,
              newLine: '',
            }),
          })
          if (r.ok) {
            // Удаляем из справочника линеек
            await fetch('/api/tobaccos/lines', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brand: effectiveBrand, name: line.original }),
            })
            successCount++
          } else {
            errorCount++
          }
          continue
        }
        // Переименование/очистка существующей линейки
        const newValue = line.value.trim()
        if (newValue === line.original) continue
        const r = await fetch('/api/tobaccos/line', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brand: effectiveBrand,
            oldLine: line.original,
            newLine: newValue,
          }),
        })
        if (r.ok) {
          // Также обновляем в справочнике линеек
          if (newValue) {
            await fetch('/api/tobaccos/lines', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brand: effectiveBrand, name: newValue }),
            })
          }
          successCount++
        } else {
          errorCount++
        }
      }

      if (errorCount > 0) {
        toast.warning(
          `Часть операций выполнена, но ${errorCount} шт. завершились ошибкой`,
        )
      } else if (successCount === 0 && !renamed) {
        toast.info('Без изменений')
      } else {
        toast.success('Бренд обновлён')
      }

      setBrandEdit(null)
      load()
      onRefresh()
    } catch {
      toast.error('Ошибка сети')
    } finally {
      setBrandEditSaving(false)
    }
  }

  const isAddMode = editForm && !editForm.id
  const isEditMode = editForm && editForm.id

  const canSaveEdit = !!formBrand && !!editForm?.flavor.trim()

  // Видимые линейки в диалоге редактирования бренда (новые не-удалённые + существующие не-удалённые)
  const brandEditVisibleLines = brandEdit?.lines.filter((l) => !l.removed) ?? []

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
            aria-label="Обновить"
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
            {grouped.map(([brand, items], groupIndex) => {
              const brandLowCount = items.filter((t) => t.isLow).length
              return (
                <AccordionItem
                  key={brand}
                  value={brand}
                  className={`group relative border-border ${groupIndex > 0 ? 'border-t-2' : 'border-t'}`}
                >
                  {/* Кнопка редактирования бренда — абсолютно позиционирована, ВНЕ AccordionTrigger */}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Настройки бренда ${brand}`}
                      title="Настройки бренда"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        openBrandEdit(brand)
                      }}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation()
                      }}
                      className="absolute top-1 right-1 z-20 flex items-center justify-center w-11 h-11 rounded-md text-muted-foreground hover:text-foreground hover:bg-background transition-base cursor-pointer opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 touch-manipulation"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                  )}
                  <AccordionTrigger className="px-4 py-4 pr-14 bg-muted hover:bg-muted/80 transition-base transition-colors border-b border-border data-[state=open]:border-b-0">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono text-base font-bold tracking-tight truncate text-foreground">
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
                  <AccordionContent className="p-0 bg-background">
                    <div className="stagger-children border-l-2 border-border ml-4">
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
                            className="group w-full text-left flex items-center gap-4 px-4 py-3 pr-4 border-t border-border first:border-t-0 hover:bg-muted/50 transition-base transition-colors cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                {/* Если line пустая — показываем только вкус (без лишнего разделителя) */}
                                {t.line && t.line.trim() !== '' && (
                                  <span className="label-mono-sm truncate">
                                    {t.line}
                                  </span>
                                )}
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
          Клик по позиции — редактирование · «→ заказ» — быстрый заказ 1 банки ·
          {' '}
          <span aria-hidden="true">⚙</span>
          {' '}
          на бренде — переименование и линейки
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

      {/* Диалог редактирования/добавления с каскадными Select */}
      <Dialog
        open={editForm !== null}
        onOpenChange={(o) => {
          if (!o) closeEdit()
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <span className="label-mono">
              {isAddMode ? 'Новая позиция' : 'Редактирование позиции'}
            </span>
            <DialogTitle>
              {isEditMode
                ? `${formBrand || editForm?.brandSelect || ''} ${editForm?.flavor ?? ''}`.trim()
                : 'Добавить табак'}
            </DialogTitle>
          </DialogHeader>

          {editForm && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* ───── Brand (Step 1) ───── */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  Бренд <span className="text-ember">*</span>
                </Label>
                <Select
                  value={editForm.brandSelect}
                  onValueChange={(v) =>
                    setEditForm({
                      ...editForm,
                      brandSelect: v,
                      // При смене бренда сбрасываем выбор линейки
                      lineSelect: '',
                      lineInput: '',
                    })
                  }
                >
                  <SelectTrigger className="w-full" aria-label="Бренд">
                    <SelectValue placeholder="Выберите бренд" />
                  </SelectTrigger>
                  <SelectContent>
                    {existingBrands.map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_BRAND}>+ Новый бренд</SelectItem>
                  </SelectContent>
                </Select>
                {editForm.brandSelect === NEW_BRAND && (
                  <Input
                    value={editForm.brandInput}
                    onChange={(e) =>
                      setEditForm({ ...editForm, brandInput: e.target.value })
                    }
                    className="font-mono"
                    placeholder="Введите название бренда"
                    autoFocus
                  />
                )}
              </div>

              {/* ───── Line (Step 2) ───── */}
              {editForm.brandSelect === NEW_BRAND ? (
                // Для нового бренда — просто Input (линейка опциональна)
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Линейка</Label>
                  <Input
                    value={editForm.lineInput}
                    onChange={(e) =>
                      setEditForm({ ...editForm, lineInput: e.target.value })
                    }
                    placeholder="Необязательно (можно оставить пустым)"
                    className="font-mono"
                  />
                </div>
              ) : editForm.brandSelect !== '' ? (
                // Для существующего бренда — Select с существующими линейками + «новая» + «без»
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Линейка</Label>
                  <Select
                    value={editForm.lineSelect}
                    onValueChange={(v) =>
                      setEditForm({
                        ...editForm,
                        lineSelect: v,
                        lineInput: v === NEW_LINE ? editForm.lineInput : '',
                      })
                    }
                  >
                    <SelectTrigger className="w-full" aria-label="Линейка">
                      <SelectValue placeholder="Без линейки" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_LINE}>— Без линейки —</SelectItem>
                      {formLinesForBrand.map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                      <SelectItem value={NEW_LINE}>+ Новая линейка</SelectItem>
                    </SelectContent>
                  </Select>
                  {editForm.lineSelect === NEW_LINE && (
                    <Input
                      value={editForm.lineInput}
                      onChange={(e) =>
                        setEditForm({ ...editForm, lineInput: e.target.value })
                      }
                      className="font-mono"
                      placeholder="Введите название линейки"
                      autoFocus
                    />
                  )}
                </div>
              ) : null}

              {/* ───── Flavor (Step 3) ───── */}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>
                  Вкус <span className="text-ember">*</span>
                </Label>
                <Input
                  value={editForm.flavor}
                  onChange={(e) =>
                    setEditForm({ ...editForm, flavor: e.target.value })
                  }
                  placeholder="Ice Grape"
                  className="font-sans"
                />
              </div>

              {/* ───── Details (Step 4) ───── */}
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

              {/* currentGrams — только в режиме редактирования */}
              {isEditMode && (
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
              )}

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
                        Удалить {editForm?.brandSelect} {editForm?.flavor}?
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
                disabled={saving || !canSaveEdit}
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

      {/* Диалог редактирования бренда (переименование + управление линейками) */}
      <Dialog
        open={brandEdit !== null}
        onOpenChange={(o) => {
          if (!o) closeBrandEdit()
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <span className="label-mono">Настройки бренда</span>
            <DialogTitle>{brandEdit?.brand ?? ''}</DialogTitle>
          </DialogHeader>

          {brandEdit && (
            <div className="space-y-4">
              {/* Имя бренда */}
              <div className="space-y-1.5">
                <Label htmlFor="brand-name-input">
                  Бренд <span className="text-ember">*</span>
                </Label>
                <Input
                  id="brand-name-input"
                  value={brandEdit.name}
                  onChange={(e) =>
                    setBrandEdit({ ...brandEdit, name: e.target.value })
                  }
                  className="font-mono"
                  placeholder="Название бренда"
                />
                <p className="label-mono-sm">
                  Переименование применится ко всем позициям бренда
                </p>
              </div>

              {/* Линейки */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Линейки</Label>
                  <span className="label-mono-sm">
                    {brandEditVisibleLines.length} шт.
                  </span>
                </div>

                {brandEditVisibleLines.length === 0 ? (
                  <p className="label-mono-sm py-2 px-3 frame rounded-md">
                    У этого бренда нет линеек
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {brandEditVisibleLines.map((line) => (
                      <div
                        key={line.id}
                        className="flex items-center gap-2"
                      >
                        <Input
                          value={line.value}
                          onChange={(e) =>
                            updateBrandLineEdit(line.id, e.target.value)
                          }
                          className="font-mono flex-1"
                          placeholder={
                            line.isNew
                              ? 'Название новой линейки'
                              : 'Название линейки'
                          }
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-ember"
                          onClick={() => removeBrandLineEdit(line.id)}
                          title={
                            line.isNew
                              ? 'Убрать поле'
                              : 'Очистить линейку у всех позиций'
                          }
                          aria-label={
                            line.isNew
                              ? 'Убрать поле'
                              : 'Очистить линейку у всех позиций'
                          }
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  onClick={addBrandLineEdit}
                  className="h-8 text-[11px]"
                >
                  <Plus className="h-3 w-3" /> Добавить линейку
                </Button>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={closeBrandEdit}
              disabled={brandEditSaving}
            >
              Отмена
            </Button>
            <Button
              onClick={saveBrandEdit}
              disabled={brandEditSaving || !brandEdit?.name.trim()}
            >
              {brandEditSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pencil className="h-3.5 w-3.5" />
              )}
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
