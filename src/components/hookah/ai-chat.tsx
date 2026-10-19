'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Send, ImageIcon, Mic, Square, X, Loader2, Sparkles, CheckCircle2, XCircle, Flame } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actions?: Array<{ tool: string; success: boolean; message: string }>
  attachments?: Array<{ type: 'photo' | 'voice'; preview?: string }>
  pending?: boolean
}

const SUGGESTIONS = [
  { text: 'Чего осталось мало?', icon: '📉' },
  { text: 'Покажи все остатки', icon: '📋' },
  { text: 'Darkside Supernova Ice Grape осталось пол банки', icon: '🫙' },
  { text: 'Пришла накладная, оформи приход', icon: '📦' },
]

interface AIChatProps {
  onAction: () => void
}

export function AIChat({ onAction }: AIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        'Привет! Я ассистент старшего кальянного мастера.\n\nЯ умею:\n• Распознавать накладные по фото\n• Понимать голосовые про остатки\n• Вести учёт и формировать заявки\n\nНапиши или нажми на микрофон для голоса.',
      timestamp: new Date().toISOString(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingImage, setPendingImage] = useState<string | null>(null)
  const [pendingImageName, setPendingImageName] = useState<string>('')
  const [isRecording, setIsRecording] = useState(false)
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const addMessage = (m: Omit<Message, 'id' | 'timestamp'>) => {
    setMessages((prev) => [
      ...prev,
      { ...m, id: crypto.randomUUID(), timestamp: new Date().toISOString() },
    ])
  }

  const updateLastAssistant = (content: string, actions?: Message['actions']) => {
    setMessages((prev) =>
      prev.map((m, i) =>
        i === prev.length - 1 && m.role === 'assistant'
          ? { ...m, content, actions, pending: false }
          : m,
      ),
    )
  }

  const sendText = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    addMessage({ role: 'user', content: trimmed })
    setInput('')
    setLoading(true)
    addMessage({ role: 'assistant', content: '', pending: true })

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, source: 'TEXT' }),
      })
      const data = await res.json()
      if (data.error) {
        updateLastAssistant(`⚠️ ${data.error}`)
      } else {
        updateLastAssistant(data.reply, data.executedActions)
        if (data.executedActions?.length > 0) onAction()
      }
    } catch {
      updateLastAssistant('⚠️ Ошибка соединения')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Нужен файл изображения')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Файл слишком большой (макс 10МБ)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPendingImage(reader.result as string)
      setPendingImageName(file.name)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const sendInvoice = async (instruction: string) => {
    if (!pendingImage) return
    setLoading(true)
    addMessage({
      role: 'user',
      content: instruction || 'Приложил накладную',
      attachments: [{ type: 'photo', preview: pendingImage }],
    })
    setPendingImage(null)
    setPendingImageName('')
    addMessage({ role: 'assistant', content: '', pending: true })

    updateLastAssistant(
      '📦 Распознавание накладных по фото отключено.\n\n' +
      'Теперь для приёма поставок есть удобный модуль — открой вкладку «Поставки» → «Новая поставка» → «ИИ из текста».\n\n' +
      'Вставь текст из накладной (Ctrl+V) и нажми «Распознать» — это быстрее и точнее, чем распознавание по фото.',
    )
    setLoading(false)
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        await sendVoice(blob)
      }
      recorder.start()
      setMediaRecorder(recorder)
      setIsRecording(true)
    } catch {
      toast.error('Нет доступа к микрофону')
    }
  }

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop()
    }
    setIsRecording(false)
    setMediaRecorder(null)
  }

  const sendVoice = async (blob: Blob) => {
    setLoading(true)
    addMessage({ role: 'user', content: 'Голосовое сообщение', attachments: [{ type: 'voice' }] })
    addMessage({ role: 'assistant', content: '', pending: true })

    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        const asrRes = await fetch('/api/asr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio: base64 }),
        })
        const asrData = await asrRes.json()
        if (!asrData.text) {
          updateLastAssistant('⚠️ Не удалось распознать речь')
          setLoading(false)
          return
        }
        const chatRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: asrData.text,
            source: 'VOICE',
            transcribedText: asrData.text,
          }),
        })
        const chatData = await chatRes.json()
        if (chatData.error) {
          updateLastAssistant(`⚠️ ${chatData.error}`)
        } else {
          updateLastAssistant(`«${asrData.text}»\n\n${chatData.reply}`, chatData.executedActions)
          if (chatData.executedActions?.length > 0) onAction()
        }
        setLoading(false)
      }
      reader.readAsDataURL(blob)
    } catch {
      updateLastAssistant('⚠️ Ошибка обработки голоса')
      setLoading(false)
    }
  }

  const handleSend = () => {
    if (pendingImage) {
      sendInvoice(input)
    } else {
      sendText(input)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header — gradient ember accent */}
      <div className="relative overflow-hidden flex items-center gap-3 px-4 h-[60px] border-b border-border gradient-ember">
        <div className="h-8 w-8 rounded-md bg-ember-foreground/15 flex items-center justify-center backdrop-blur-sm">
          <Flame className="h-4 w-4 text-ember-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono font-bold text-sm text-ember-foreground leading-none tracking-tight">
            AI ассистент
          </p>
          <p className="label-mono-sm mt-1 text-ember-foreground/70">
            старшего кальянного мастера
          </p>
        </div>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ember-foreground/70" />}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex slide-in-right',
                m.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[85%] px-3.5 py-2.5 text-sm rounded-md',
                  m.role === 'user'
                    ? 'gradient-ember text-ember-foreground'
                    : 'border border-border bg-muted text-foreground',
                )}
              >
                {m.attachments?.map((att, i) =>
                  att.type === 'photo' && att.preview ? (
                    <img
                      key={i}
                      src={att.preview}
                      alt="накладная"
                      className="mb-2 max-h-32 object-cover rounded-sm"
                    />
                  ) : att.type === 'voice' ? (
                    <div key={i} className="flex items-center gap-1.5 mb-1 label-mono-sm opacity-80">
                      <Mic className="h-3 w-3" /> голосовое
                    </div>
                  ) : null,
                )}
                {m.pending ? (
                  <div className="flex items-center gap-1 py-1">
                    <span className="h-1.5 w-1.5 bg-current rounded-full cursor-blink" />
                    <span className="h-1.5 w-1.5 bg-current rounded-full cursor-blink [animation-delay:0.2s]" />
                    <span className="h-1.5 w-1.5 bg-current rounded-full cursor-blink [animation-delay:0.4s]" />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words body-sans leading-snug">{m.content}</p>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-current/15 space-y-1">
                    {m.actions.map((a, i) => (
                      <div key={i} className="flex items-start gap-1.5 label-mono-sm">
                        {a.success ? (
                          <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-success" />
                        ) : (
                          <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-destructive" />
                        )}
                        <span className="break-words">{a.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Подсказки */}
          {messages.length <= 1 && (
            <div className="space-y-1.5 pt-3">
              <p className="label-mono px-1 mb-2">Попробуй:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.text}
                  onClick={() => sendText(s.text)}
                  className="w-full text-left px-3 py-2.5 border border-border rounded-md hover:border-ember hover:bg-ember-soft transition-base transition-colors group"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-base">{s.icon}</span>
                    <span className="label-mono-sm group-hover:text-ember transition-colors">
                      {s.text}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-4 pt-3 pb-2 border-t border-border">
          <div className="relative inline-block">
            <img src={pendingImage} alt="preview" className="h-16 object-cover rounded-md" />
            <button
              onClick={() => {
                setPendingImage(null)
                setPendingImageName('')
              }}
              className="absolute -top-1.5 -right-1.5 ember-bg p-0.5 rounded-full"
            >
              <X className="h-3 w-3 text-ember-foreground" />
            </button>
          </div>
          <p className="label-mono-sm mt-1.5 truncate">
            {pendingImageName} — добавь комментарий или отправь
          </p>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border space-y-2">
        <div className="flex items-end gap-1.5">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="border border-border rounded-md p-2 hover:border-foreground hover:bg-muted transition-base transition-colors flex items-center justify-center h-9 w-9">
              <ImageIcon className="h-4 w-4" />
            </div>
          </label>

          {isRecording ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={stopRecording}
              className="h-9 w-9 rounded-md live-pulse"
            >
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              onClick={startRecording}
              disabled={loading}
              className="h-9 w-9 rounded-md"
              title="Записать голос"
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isRecording ? 'Записываю...' : pendingImage ? 'Комментарий...' : 'Сообщение...'}
            disabled={loading || isRecording}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading || (!input.trim() && !pendingImage) || isRecording}
            className="h-9 w-9 rounded-md gradient-ember hover:opacity-90"
            title="Отправить"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2 label-mono-sm text-ember live-pulse">
            <span className="h-1.5 w-1.5 bg-ember rounded-full" />
            Идёт запись... нажми ⬛ чтобы остановить
          </div>
        )}
      </div>
    </div>
  )
}
