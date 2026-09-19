'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  X,
  Pencil,
  Save,
  Loader2,
  Flame,
  Sparkles,
  Beaker,
  GitBranch,
  Coffee,
  Wind,
  Droplets,
  BookOpen,
  ChevronDown,
} from 'lucide-react'
import type { Tobacco } from '@/lib/types'

interface TobaccoDetailsModalProps {
  tobacco: Tobacco | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canEdit?: boolean
  onSaved?: () => void
}

// Парсим flavorProfile в структуру
interface ParsedProfile {
  categories: string[] // ["Десертный", "сладкий"]
  notes: string[] // ["Шоколад", "Кекс"]
  sweetness?: number // 7
  acidity?: number // 4
}

function parseFlavorProfile(text: string | null | undefined): ParsedProfile | null {
  if (!text || !text.trim()) return null

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const result: ParsedProfile = { categories: [], notes: [] }

  // Первая строка — категории через запятую
  if (lines.length > 0) {
    result.categories = lines[0].split(',').map((c) => c.trim()).filter(Boolean)
  }

  // Ищем "Ноты:"
  for (const line of lines) {
    if (line.toLowerCase().startsWith('ноты:')) {
      const notesStr = line.slice(5).trim()
      result.notes = notesStr.split(',').map((n) => n.trim()).filter(Boolean).filter((n) => n !== '.')
    }
    // Ищем сладость
    const sweetMatch = line.match(/сладость[:\s]+(\d+)\s*\/\s*10/i)
    if (sweetMatch) result.sweetness = parseInt(sweetMatch[1], 10)
    // Ищем кислотность
    const acidMatch = line.match(/кислотность[:\s]+(\d+)\s*\/\s*10/i)
    if (acidMatch) result.acidity = parseInt(acidMatch[1], 10)
  }

  return result
}

// Парсим сочетания: "1. Киви / Kiwi — Element (Земля)" → [{ num, text }]
function parsePairings(text: string | null | undefined): Array<{ num: number; text: string }> {
  if (!text) return []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const result: Array<{ num: number; text: string }> = []
  for (const line of lines) {
    const match = line.match(/^(\d+)\.\s*(.+)$/)
    if (match) {
      result.push({ num: parseInt(match[1], 10), text: match[2].trim() })
    } else if (line) {
      // Если нет номера — добавляем как продолжение предыдущего
      if (result.length > 0) {
        result[result.length - 1].text += ' ' + line
      } else {
        result.push({ num: 1, text: line })
      }
    }
  }
  return result
}

// Парсим миксы: "1. с кислинкой · Брауни × Фреш из киви и маракуйи [Автоподбор ATLAS]\nBlack Burn · Classic — Брауни..."
function parseMixRecipes(text: string | null | undefined): Array<{
  num: number
  description?: string
  composition: string
  note?: string
}> {
  if (!text) return []
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const result: Array<{ num: number; description?: string; composition: string; note?: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(\d+)\.\s*(.+)$/)
    if (match) {
      const num = parseInt(match[1], 10)
      const rest = match[2]

      // Ищем проценты в скобках, например "50/50" или "60/40"
      const pctMatch = rest.match(/\(?(\d{1,2})\s*\/\s*(\d{1,2})\)?/)

      // Разделяем по "·" — описание и состав
      const parts = rest.split('·').map((p) => p.trim())

      const entry: { num: number; description?: string; composition: string; note?: string } = {
        num,
        composition: rest,
      }

      if (parts.length >= 2) {
        entry.description = parts[0]
        entry.composition = parts.slice(1).join(' · ')
      }

      // Следующая строка может быть уточнением (бренд/линейка)
      const nextLine = lines[i + 1]
      if (nextLine && !/^\d+\./.test(nextLine)) {
        entry.note = nextLine
        i++ // пропускаем следующую строку
      }

      if (pctMatch) {
        entry.composition += ` (${pctMatch[1]}/${pctMatch[2]})`
      }

      result.push(entry)
    }
  }

  return result
}

// Иконка для категории вкуса
function categoryIcon(category: string) {
  const c = category.toLowerCase()
  if (c.includes('фрукт')) return <Droplets className="h-3.5 w-3.5" />
  if (c.includes('ягод')) return <Droplets className="h-3.5 w-3.5" />
  if (c.includes('троп')) return <Droplets className="h-3.5 w-3.5" />
  if (c.includes('десерт') || c.includes('сладк')) return <Coffee className="h-3.5 w-3.5" />
  if (c.includes('цвет') || c.includes('трав')) return <GitBranch className="h-3.5 w-3.5" />
  if (c.includes('цитрус') || c.includes('кисл')) return <Droplets className="h-3.5 w-3.5" />
  if (c.includes('свеж') || c.includes('охлажда') || c.includes('мят')) return <Wind className="h-3.5 w-3.5" />
  if (c.includes('алкогол')) return <Beaker className="h-3.5 w-3.5" />
  if (c.includes('табачн')) return <Flame className="h-3.5 w-3.5" />
  if (c.includes('напит')) return <Droplets className="h-3.5 w-3.5" />
  return <Sparkles className="h-3.5 w-3.5" />
}

// Иконка крепости
function strengthIcon(strength: string | null | undefined) {
  if (!strength) return null
  const s = strength.toLowerCase()
  if (s.includes('очень')) return { icon: <Flame className="h-4 w-4 text-red-500" />, color: 'text-red-500' }
  if (s.includes('высок')) return { icon: <Flame className="h-4 w-4 text-orange-500" />, color: 'text-orange-500' }
  if (s.includes('средне-лёгк') || s.includes('средне-легк')) return { icon: <Flame className="h-4 w-4 text-yellow-500" />, color: 'text-yellow-500' }
  if (s.includes('средн')) return { icon: <Flame className="h-4 w-4 text-amber-500" />, color: 'text-amber-500' }
  if (s.includes('лёгк') || s.includes('легк')) return { icon: <Flame className="h-4 w-4 text-emerald-500" />, color: 'text-emerald-500' }
  return { icon: <Flame className="h-4 w-4" />, color: '' }
}

export function TobaccoDetailsModal({
  tobacco,
  open,
  onOpenChange,
  canEdit = false,
  onSaved,
}: TobaccoDetailsModalProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  // Форма редактирования
  const [editStrength, setEditStrength] = useState('')
  const [editFlavorProfile, setEditFlavorProfile] = useState('')
  const [editPairings, setEditPairings] = useState('')
  const [editMixRecipes, setEditMixRecipes] = useState('')
  const [editDefaultJarGrams, setEditDefaultJarGrams] = useState(250)
  const [editThresholdGrams, setEditThresholdGrams] = useState(70)

  const startEdit = () => {
    if (!tobacco) return
    setEditStrength(tobacco.strength ?? '')
    setEditFlavorProfile(tobacco.flavorProfile ?? '')
    setEditPairings(tobacco.pairings ?? '')
    setEditMixRecipes(tobacco.mixRecipes ?? '')
    setEditDefaultJarGrams(tobacco.defaultJarGrams)
    setEditThresholdGrams(tobacco.thresholdGrams)
    setEditing(true)
  }

  const saveEdit = async () => {
    if (!tobacco) return
    setSaving(true)
    try {
      const res = await fetch('/api/tobaccos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tobacco.id,
          strength: editStrength.trim() || null,
          flavorProfile: editFlavorProfile.trim() || null,
          pairings: editPairings.trim() || null,
          mixRecipes: editMixRecipes.trim() || null,
          defaultJarGrams: editDefaultJarGrams,
          thresholdGrams: editThresholdGrams,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ошибка' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      toast.success('Характеристики сохранены')
      setEditing(false)
      onSaved?.()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!tobacco) return null

  const profile = parseFlavorProfile(tobacco.flavorProfile)
  const pairings = parsePairings(tobacco.pairings)
  const mixes = parseMixRecipes(tobacco.mixRecipes)
  const strength = strengthIcon(tobacco.strength)

  const content = (
    <div className="space-y-4">
      {/* Заголовок: бренд / линейка / вкус */}
      <div className="space-y-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <h3 className="font-mono text-lg font-bold text-foreground">{tobacco.brand}</h3>
          {tobacco.line && (
            <Badge variant="outline" className="label-mono-sm">
              {tobacco.line}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{tobacco.flavor}</p>
      </div>

      {/* Краткие характеристики: остаток + крепость */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="label-mono-sm text-muted-foreground">Остаток</p>
          <p className="font-mono text-xl font-bold tabular">
            {tobacco.currentGrams}
            <span className="label-mono-sm text-muted-foreground ml-1">/ {tobacco.defaultJarGrams}г</span>
          </p>
          {tobacco.isLow && (
            <Badge variant="outline" className="mt-1 border-ember text-ember bg-transparent label-mono-sm">
              мало (порог {tobacco.thresholdGrams}г)
            </Badge>
          )}
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="label-mono-sm text-muted-foreground">Крепость</p>
          {strength ? (
            <div className="flex items-center gap-2 mt-0.5">
              {strength.icon}
              <p className="font-sans text-lg font-medium">{tobacco.strength}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">—</p>
          )}
        </div>
      </div>

      {editing ? (
        /* ─── Режим редактирования ─── */
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <Label className="text-xs">Крепость</Label>
            <Input
              value={editStrength}
              onChange={(e) => setEditStrength(e.target.value)}
              placeholder="Лёгкая / Средняя / Высокая / Очень высокая"
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Вес банки (г)</Label>
              <Input
                type="number"
                value={editDefaultJarGrams}
                onChange={(e) => setEditDefaultJarGrams(parseInt(e.target.value, 10) || 250)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Порог «мало» (г)</Label>
              <Input
                type="number"
                value={editThresholdGrams}
                onChange={(e) => setEditThresholdGrams(parseInt(e.target.value, 10) || 70)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Профиль вкуса (категории, ноты, сладость/кислотность)</Label>
            <Textarea
              value={editFlavorProfile}
              onChange={(e) => setEditFlavorProfile(e.target.value)}
              placeholder="Десертный, сладкий&#10;Ноты: Шоколад, Кекс.&#10;Сладость: 7/10; кислотность: 4/10."
              className="min-h-[100px] text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Сочетания</Label>
            <Textarea
              value={editPairings}
              onChange={(e) => setEditPairings(e.target.value)}
              placeholder="1. Киви — Element (Земля)&#10;2. ..."
              className="min-h-[100px] text-xs font-mono"
            />
          </div>
          <div>
            <Label className="text-xs">Миксы</Label>
            <Textarea
              value={editMixRecipes}
              onChange={(e) => setEditMixRecipes(e.target.value)}
              placeholder="1. описание · состав&#10;..."
              className="min-h-[100px] text-xs font-mono"
            />
          </div>
        </div>
      ) : (
        /* ─── Режим просмотра ─── */
        <>
          {/* Профиль вкуса */}
          {profile && (
            <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
              <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Профиль вкуса
              </div>
              {profile.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {profile.categories.map((cat, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="label-mono-sm gap-1 py-0.5"
                    >
                      {categoryIcon(cat)}
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
              {profile.notes.length > 0 && (
                <div className="flex items-start gap-2 text-xs">
                  <span className="label-mono-sm text-muted-foreground shrink-0">Ноты:</span>
                  <span className="font-sans">{profile.notes.join(', ')}</span>
                </div>
              )}
              {(profile.sweetness !== undefined || profile.acidity !== undefined) && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {profile.sweetness !== undefined && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="label-mono-sm text-muted-foreground">Сладость</span>
                        <span className="label-mono-sm tabular">{profile.sweetness}/10</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500"
                          style={{ width: `${profile.sweetness * 10}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {profile.acidity !== undefined && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="label-mono-sm text-muted-foreground">Кислотность</span>
                        <span className="label-mono-sm tabular">{profile.acidity}/10</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-lime-500"
                          style={{ width: `${profile.acidity * 10}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Сочетания */}
          {pairings.length > 0 && (
            <CollapsibleSection
              title="Сочетается с"
              icon={<BookOpen className="h-3.5 w-3.5" />}
              count={pairings.length}
              defaultOpen={false}
            >
              <ol className="space-y-1.5 text-xs">
                {pairings.map((p, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="label-mono-sm text-muted-foreground shrink-0">{p.num}.</span>
                    <span className="font-sans">{p.text}</span>
                  </li>
                ))}
              </ol>
            </CollapsibleSection>
          )}

          {/* Миксы */}
          {mixes.length > 0 && (
            <CollapsibleSection
              title="Готовые миксы"
              icon={<Beaker className="h-3.5 w-3.5" />}
              count={mixes.length}
              defaultOpen={false}
            >
              <ol className="space-y-2 text-xs">
                {mixes.map((m, i) => (
                  <li key={i} className="rounded-md border border-border p-2 bg-card">
                    <div className="flex gap-2">
                      <span className="label-mono-sm text-muted-foreground shrink-0">{m.num}.</span>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {m.description && (
                          <p className="label-mono-sm text-muted-foreground">{m.description}</p>
                        )}
                        <p className="font-sans">{m.composition}</p>
                        {m.note && (
                          <p className="text-[10px] text-muted-foreground italic">{m.note}</p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </CollapsibleSection>
          )}

          {/* Если нет расширенных данных */}
          {!profile && pairings.length === 0 && mixes.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">
                Расширенные характеристики не заполнены
              </p>
              {canEdit && (
                <Button size="sm" variant="outline" className="mt-2" onClick={startEdit}>
                  <Pencil className="h-3.5 w-3.5" />
                  Добавить информацию
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* Кнопки редактирования (только для старшего) */}
      {canEdit && (
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                Отмена
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Сохранить
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" />
              Редактировать характеристики
            </Button>
          )}
        </div>
      )}
    </div>
  )

  // На мобильных — Sheet снизу, на десктопе — Dialog по центру
  return (
    <>
      {/* Десктоп */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[560px] w-[95vw] max-h-[90vh] flex flex-col p-4 sm:p-6 gap-3 overflow-hidden hidden sm:flex">
          <DialogHeader className="shrink-0">
            <DialogTitle className="label-mono flex items-center gap-2">
              <Flame className="h-4 w-4 text-ember" />
              Карточка табака
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            {content}
          </div>
        </DialogContent>
      </Dialog>

      {/* Мобильный — Sheet снизу */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="sm:hidden h-[90vh] p-4 flex flex-col gap-3 overflow-hidden rounded-t-lg">
          <SheetHeader className="shrink-0">
            <SheetTitle className="label-mono flex items-center gap-2">
              <Flame className="h-4 w-4 text-ember" />
              Карточка табака
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-y-auto pr-1 -mr-1">
            {content}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

// ─── Сворачиваемая секция ───
function CollapsibleSection({
  title,
  icon,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  icon?: React.ReactNode
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-md border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-2 label-mono-sm text-muted-foreground">
          {icon}
          {title}
          {count !== undefined && (
            <Badge variant="outline" className="label-mono-sm py-0">
              {count}
            </Badge>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-border">
          {children}
        </div>
      )}
    </div>
  )
}
