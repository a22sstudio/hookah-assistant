'use client'

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Send, ImageIcon, Mic, Square, X, Loader2, Sparkles, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

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
  'Чего осталось мало?',
  'Покажи все остатки',
  'Darkside Supernova Ice Grape осталось пол банки',
  'Пришла накладная, оформи приход',
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
        'Привет! Я ассистент старшего кальянного мастера 🍃\n\nЯ умею:\n• Распознавать накладные по фото\n• Понимать голосовые про остатки\n• Вести учёт и формировать заявки\n\nНапиши или нажми 🎤 для голоса.',
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

  // Автопрокрутка вниз
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

  // Отправка текстового сообщения
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

  // Загрузка изображения накладной
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

  // Отправка фото накладной
  const sendInvoice = async (instruction: string) => {
    if (!pendingImage) return
    setLoading(true)
    addMessage({
      role: 'user',
      content: instruction || '📸 Приложил накладную',
      attachments: [{ type: 'photo', preview: pendingImage }],
    })
    setPendingImage(null)
    setPendingImageName('')
    addMessage({ role: 'assistant', content: '', pending: true })

    try {
      // Шаг 1: распознать накладную через VLM
      const vlmRes = await fetch('/api/vlm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: pendingImage }),
      })
      const vlmData = await vlmRes.json()
      if (!vlmData.items || vlmData.items.length === 0) {
        updateLastAssistant(
          '⚠️ Не удалось распознать позиции на фото. Попробуй другое фото или добавь вручную.',
        )
        return
      }

      // Шаг 2: отправить распознанное в чат-движок для оформления прихода
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: instruction || 'оформи приход по накладной',
          source: 'PHOTO',
          invoiceItems: vlmData.items,
        }),
      })
      const chatData = await chatRes.json()
      if (chatData.error) {
        updateLastAssistant(`⚠️ ${chatData.error}`)
      } else {
        const recognizedList = vlmData.items
          .map(
            (i: { brand: string; line: string; flavor: string; grams: number }) =>
              `• ${i.brand} ${i.line} ${i.flavor} — ${i.grams}г`,
          )
          .join('\n')
        updateLastAssistant(
          `${chatData.reply}\n\n📋 Распознано:\n${recognizedList}`,
          chatData.executedActions,
        )
        if (chatData.executedActions?.length > 0) onAction()
      }
    } catch {
      updateLastAssistant('⚠️ Ошибка обработки изображения')
    } finally {
      setLoading(false)
    }
  }

  // Запись голоса
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
    addMessage({ role: 'user', content: '🎙 Голосовое сообщение', attachments: [{ type: 'voice' }] })
    addMessage({ role: 'assistant', content: '', pending: true })

    try {
      // Конвертируем blob в base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1]
        // Шаг 1: ASR
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
        // Шаг 2: чат с распознанным текстом
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
          updateLastAssistant(
            `🎙 *«${asrData.text}»*\n\n${chatData.reply}`,
            chatData.executedActions,
          )
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
    <Card className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40">
        <div className="rounded-full bg-emerald-600 p-1.5">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-none">AI Ассистент</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            старшего кальянного мастера
          </p>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-3 space-y-3">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-emerald-600 text-white rounded-br-sm'
                    : 'bg-muted rounded-bl-sm'
                }`}
              >
                {m.attachments?.map((att, i) =>
                  att.type === 'photo' && att.preview ? (
                    <img
                      key={i}
                      src={att.preview}
                      alt="накладная"
                      className="rounded-lg mb-1 max-h-32 object-cover"
                    />
                  ) : att.type === 'voice' ? (
                    <div key={i} className="flex items-center gap-1 mb-1 text-xs opacity-80">
                      <Mic className="h-3 w-3" /> голосовое
                    </div>
                  ) : null,
                )}
                {m.pending ? (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{m.content}</p>
                )}
                {m.actions && m.actions.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-current/10 space-y-1">
                    {m.actions.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-1.5 text-[11px] opacity-90"
                      >
                        {a.success ? (
                          <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0 text-emerald-300" />
                        ) : (
                          <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0 text-red-300" />
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
            <div className="space-y-1.5 pt-2">
              <p className="text-[10px] text-muted-foreground px-1">Попробуй:</p>
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendText(s)}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  💬 {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pending image preview */}
      {pendingImage && (
        <div className="px-3 pt-2">
          <div className="relative inline-block">
            <img
              src={pendingImage}
              alt="preview"
              className="h-16 rounded-lg object-cover"
            />
            <button
              onClick={() => {
                setPendingImage(null)
                setPendingImageName('')
              }}
              className="absolute -top-1.5 -right-1.5 rounded-full bg-destructive text-white p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1 truncate">
            {pendingImageName} — добавь комментарий или отправь
          </p>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t space-y-2">
        <div className="flex items-end gap-2">
          <label className="cursor-pointer">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
            <div className="rounded-lg border p-2 hover:bg-muted/50 transition-colors">
              <ImageIcon className="h-4 w-4" />
            </div>
          </label>

          {isRecording ? (
            <Button
              size="icon"
              variant="destructive"
              onClick={stopRecording}
              className="rounded-lg"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="outline"
              onClick={startRecording}
              disabled={loading}
              className="rounded-lg"
              title="Записать голос"
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isRecording ? 'Записываю...' : pendingImage ? 'Комментарий к накладной...' : 'Сообщение...'}
            disabled={loading || isRecording}
            className="flex-1"
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={loading || (!input.trim() && !pendingImage) || isRecording}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {isRecording && (
          <div className="flex items-center gap-2 text-xs text-red-600 animate-pulse">
            <span className="h-2 w-2 rounded-full bg-red-600" />
            Идёт запись... нажми ⬛ чтобы остановить
          </div>
        )}
      </div>
    </Card>
  )
}
