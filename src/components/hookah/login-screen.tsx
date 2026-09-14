'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { Lock, Loader2, ArrowRight, Send } from 'lucide-react'
import { Master } from '@/lib/types'
import { toast } from 'sonner'

interface LoginScreenProps {
  onLogin: (master: Master) => void
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [pin, setPin] = useState(['', '', '', ''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputsRef = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  const handleChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1)
    setError(null)
    const next = [...pin]
    next[i] = digit
    setPin(next)
    if (digit && i < 3) {
      inputsRef.current[i + 1]?.focus()
    }
    // Если все 4 цифры введены — автосабмит
    if (digit && next.every((d) => d !== '') && i === 3) {
      void submit(next.join(''))
    } else if (digit && next.every((d) => d !== '') && i < 3) {
      // Завершение, если пользователь ввёл последнюю через middle-paste — никогда. ОК.
    }
  }

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) {
      inputsRef.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      inputsRef.current[i - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && i < 3) {
      inputsRef.current[i + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (!text) return
    const next = ['', '', '', '']
    for (let i = 0; i < text.length; i++) next[i] = text[i]
    setPin(next)
    setError(null)
    if (text.length === 4) {
      void submit(text)
    } else {
      inputsRef.current[text.length]?.focus()
    }
  }

  const submit = async (pinValue: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinValue }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Неверный PIN')
        setPin(['', '', '', ''])
        inputsRef.current[0]?.focus()
        return
      }
      if (data.master) {
        toast.success(`Добро пожаловать, ${data.master.name}`)
        onLogin(data.master as Master)
      }
    } catch {
      setError('Ошибка соединения')
      setPin(['', '', '', ''])
      inputsRef.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const filled = pin.every((d) => d !== '')

  const demoPins = [
    { label: 'Старший', pin: '1111', hint: 'тимур' },
    { label: 'Мастер', pin: '2222', hint: 'айрат' },
    { label: 'Мастер', pin: '3333', hint: 'марат' },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8 relative">
      {/* Тонкая разметка-сетка на фоне — адаптивная к тёмной теме через rgba foreground */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Theme toggle в углу */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-sm flex flex-col fade-in">
        {/* Label-маркер */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <span className="h-px w-8 bg-border" />
          <span className="label-mono">Кальянная CRM</span>
          <span className="h-px w-8 bg-border" />
        </div>

        {/* Заголовок */}
        <h1
          className="heading-mono text-center text-foreground leading-[0.95]"
          style={{ fontSize: 'clamp(32px, 7vw, 56px)' }}
        >
          HOOKAH
          <br />
          ASSISTANT
        </h1>

        <p className="body-sans text-center text-muted-foreground mt-4 text-sm">
          Учёт табака, смены мастеров, заявки.
          <br />
          Вход по PIN-коду.
        </p>

        {/* PIN-форма */}
        <div className="mt-10 flex flex-col items-center gap-5">
          <div className="label-mono flex items-center gap-2">
            <Lock className="h-3 w-3" />
            Enter PIN
          </div>

          <div
            className="flex gap-3 justify-center"
            onPaste={handlePaste}
          >
            {pin.map((d, i) => (
              <Input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={d}
                disabled={loading}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`h-16 w-14 text-center text-3xl font-mono font-bold ${
                  error
                    ? 'border-destructive text-destructive'
                    : d
                      ? 'border-foreground text-foreground'
                      : ''
                }`}
                aria-label={`Цифра ${i + 1}`}
              />
            ))}
          </div>

          {error && (
            <p className="text-sm text-destructive font-mono tracking-tight fade-in">
              {error}
            </p>
          )}

          <Button
            className="w-full h-12 text-sm"
            disabled={!filled || loading}
            onClick={() => filled && void submit(pin.join(''))}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Вход...
              </>
            ) : (
              <>
                Войти <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>

        {/* Демо-пины */}
        <div className="mt-10 border-t border-border pt-6">
          <div className="label-mono mb-3 text-center">Demo Access</div>
          <div className="flex flex-col gap-2">
            {demoPins.map((d) => (
              <button
                key={d.pin}
                onClick={() => {
                  setPin(d.pin.split(''))
                  void submit(d.pin)
                }}
                disabled={loading}
                className="group flex items-center justify-between border border-border rounded-md px-3 py-2.5 hover:border-foreground transition-base transition-colors disabled:opacity-50"
              >
                <span className="label-mono group-hover:text-foreground">
                  {d.label} · {d.hint}
                </span>
                <span className="font-mono text-sm font-bold tracking-widest text-foreground">
                  [{d.pin}]
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-center gap-1.5 label-mono-sm">
            <Send className="h-3 w-3" />
            <span>
              Или через{' '}
              <span className="text-foreground font-bold">@Defowork_bot</span>{' '}
              → <span className="font-mono">/claim PIN</span>
            </span>
          </div>
        </div>
      </div>

      <p className="absolute bottom-4 left-0 right-0 text-center label-mono-sm">
        v1.0 · powered by z.ai
      </p>
    </div>
  )
}
