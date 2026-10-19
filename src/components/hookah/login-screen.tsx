'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ThemeToggle } from '@/components/theme-toggle'
import { Lock, Loader2, ArrowRight, Send, Flame } from 'lucide-react'
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
    if (digit && next.every((d) => d !== '') && i === 3) {
      void submit(next.join(''))
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

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Ambient ember glow background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(220, 47, 2, 0.18), transparent), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(245, 158, 11, 0.10), transparent)',
        }}
      />
      {/* Grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, var(--foreground) 1px, transparent 1px), linear-gradient(to bottom, var(--foreground) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 80%)',
        }}
      />

      {/* Top-right theme toggle */}
      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      {/* Center content */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 relative">
        <div className="w-full max-w-sm flex flex-col fade-in">
          {/* Brand mark with flame icon */}
          <div className="flex flex-col items-center mb-10">
            <div className="relative mb-6">
              <div className="h-16 w-16 rounded-xl gradient-ember flex items-center justify-center shadow-2xl glow-ember">
                <Flame className="h-8 w-8 text-ember-foreground" />
              </div>
            </div>

            {/* Label-маркер */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="h-px w-8 bg-border" />
              <span className="label-mono">Кальянная CRM</span>
              <span className="h-px w-8 bg-border" />
            </div>

            {/* Title */}
            <h1
              className="heading-display text-center text-foreground"
              style={{ fontSize: 'clamp(34px, 7vw, 54px)' }}
            >
              HOOKAH
              <br />
              <span className="ember-text">ASSISTANT</span>
            </h1>

            <p className="body-sans text-center text-muted-foreground mt-4 text-[14px] leading-relaxed max-w-[280px]">
              Учёт табака, смены мастеров, заявки и поставки.
              <br />
              <span className="text-foreground/70">Вход по PIN-коду.</span>
            </p>
          </div>

          {/* PIN-форма */}
          <div className="flex flex-col items-center gap-5">
            <div className="label-mono flex items-center gap-2">
              <Lock className="h-3 w-3" />
              Enter PIN
            </div>

            <div className="flex gap-3 justify-center" onPaste={handlePaste}>
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
                  className={`h-16 w-14 text-center text-3xl font-mono font-bold transition-base ${
                    error
                      ? 'border-destructive text-destructive animate-pulse'
                      : d
                        ? 'border-ember text-foreground ember-glow'
                        : ''
                  }`}
                  aria-label={`Цифра ${i + 1}`}
                />
              ))}
            </div>

            {error && (
              <p className="text-sm text-destructive font-mono tracking-tight fade-in flex items-center gap-2">
                <span className="h-1 w-1 rounded-full bg-destructive" />
                {error}
              </p>
            )}

            <Button
              className="w-full h-12 text-sm gradient-ember text-ember-foreground ember-glow hover:opacity-90 transition-base"
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

          {/* Telegram hint */}
          <div className="mt-8 flex items-center justify-center gap-1.5 label-mono-sm">
            <Send className="h-3 w-3" />
            <span>
              Или через{' '}
              <span className="text-foreground font-bold">@Defowork_bot</span>{' '}
              → <span className="font-mono text-ember">/claim PIN</span>
            </span>
          </div>
        </div>
      </div>

      {/* Bottom version */}
      <div className="relative z-10 pb-6 px-4">
        <div className="mx-auto max-w-sm flex items-center justify-between label-mono-sm">
          <span>v2.0 · Ember Studio</span>
          <span className="flex items-center gap-1.5">
            powered by
            <span className="ember-text font-bold">z.ai</span>
          </span>
        </div>
      </div>
    </div>
  )
}
