'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AppNotification, AppNotificationType } from '@/lib/types'
import { masterAvatarClass, timeAgo, initials } from '@/lib/master-utils'
import {
  Bell,
  AlertTriangle,
  ShoppingCart,
  Star,
  LogIn,
  LogOut,
  Package,
  CheckCheck,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

interface NotificationsBellProps {
  refreshKey: number
}

const NOTIF_ICON: Record<AppNotificationType, typeof Bell> = {
  FINISHED: AlertTriangle,
  REQUEST: ShoppingCart,
  WISH: Star,
  SHIFT_OPEN: LogIn,
  SHIFT_CLOSE: LogOut,
  LOW_STOCK: Package,
}

const NOTIF_LABEL: Record<AppNotificationType, string> = {
  FINISHED: 'ЗАКОНЧИЛСЯ',
  REQUEST: 'ЗАЯВКА',
  WISH: 'ХОТЕЛКА',
  SHIFT_OPEN: 'СМЕНА ОТКРЫТА',
  SHIFT_CLOSE: 'СМЕНА ЗАКРЫТА',
  LOW_STOCK: 'МАЛО',
}

export function NotificationsBell({ refreshKey }: NotificationsBellProps) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const d = await res.json()
      setItems(d.notifications ?? [])
      setUnread(d.unreadCount ?? 0)
    } catch {
      // тихо
    }
  }, [])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // авто-рефреш каждые 10 секунд
  useEffect(() => {
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [load])

  const markAllRead = async () => {
    setLoading(true)
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      })
      await load()
    } catch {
      toast.error('Не удалось отметить')
    } finally {
      setLoading(false)
    }
  }

  const markRead = async (id: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await load()
    } catch {
      // тихо
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-9 w-9"
          aria-label="Уведомления"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-ember text-ember-foreground text-[10px] font-mono font-bold flex items-center justify-center rounded-full animate-in zoom-in fade-in-scale">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(92vw,380px)] p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-foreground text-background rounded-t-md">
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            <span className="font-mono uppercase tracking-tight text-xs font-bold">Уведомления</span>
            {unread > 0 && (
              <span className="text-[10px] bg-ember text-ember-foreground px-1.5 py-0.5 font-mono font-bold rounded-sm">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[10px] text-background hover:bg-background/10 hover:text-background"
              disabled={loading}
              onClick={markAllRead}
            >
              {loading ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
              )}
              Прочитать все
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[60vh]">
          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground body-sans">
              <Bell className="h-6 w-6 mx-auto mb-3 text-muted-foreground/70" />
              Пока тихо.
            </div>
          ) : (
            <div className="stagger-children">
              {items.map((n) => {
                const Icon = NOTIF_ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`w-full flex items-start gap-3 p-3 text-left transition-base transition-colors border-b border-border last:border-b-0 hover:bg-muted/50 ${
                      !n.read ? 'bg-ember/[0.04]' : ''
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex items-center justify-center h-7 w-7 shrink-0 border rounded-sm ${
                        !n.read
                          ? 'border-ember text-ember'
                          : 'border-border text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="label-mono-sm">
                          {NOTIF_LABEL[n.type]}
                        </span>
                      </div>
                      <p className="text-sm leading-snug body-sans text-foreground">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        {n.master && (
                          <div className="flex items-center gap-1">
                            <span
                              className={`h-3.5 w-3.5 ${masterAvatarClass(
                                n.master.color,
                              )} flex items-center justify-center text-[7px] font-mono font-bold text-white rounded-sm`}
                            >
                              {initials(n.master.name)}
                            </span>
                            <span className="label-mono-sm">
                              {n.master.name}
                            </span>
                          </div>
                        )}
                        <span className="label-mono-sm">
                          · {timeAgo(n.createdAt)}
                        </span>
                      </div>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-1.5 w-1.5 bg-ember shrink-0 rounded-full" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
