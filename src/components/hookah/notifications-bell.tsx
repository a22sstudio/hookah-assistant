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

const NOTIF_COLOR: Record<AppNotificationType, string> = {
  FINISHED: 'text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-400',
  REQUEST: 'text-sky-600 bg-sky-100 dark:bg-sky-950 dark:text-sky-400',
  WISH: 'text-violet-600 bg-violet-100 dark:bg-violet-950 dark:text-violet-400',
  SHIFT_OPEN: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400',
  SHIFT_CLOSE: 'text-rose-600 bg-rose-100 dark:bg-rose-950 dark:text-rose-400',
  LOW_STOCK: 'text-amber-600 bg-amber-100 dark:bg-amber-950 dark:text-amber-400',
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
          className="relative h-10 w-10 rounded-full"
          aria-label="Уведомления"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-in zoom-in">
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
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold text-sm">Уведомления</span>
            {unread > 0 && (
              <span className="text-[10px] rounded-full bg-rose-500 text-white px-1.5 py-0.5 font-bold">
                {unread}
              </span>
            )}
          </div>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
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
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Bell className="h-6 w-6 mx-auto mb-2 opacity-40" />
              Пока тихо
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => {
                const Icon = NOTIF_ICON[n.type] ?? Bell
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read && markRead(n.id)}
                    className={`w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50 ${
                      !n.read ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                    }`}
                  >
                    <div className={`mt-0.5 rounded-lg p-1.5 ${NOTIF_COLOR[n.type]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {n.master && (
                          <div className="flex items-center gap-1">
                            <span
                              className={`h-3.5 w-3.5 rounded-full ${masterAvatarClass(
                                n.master.color,
                              )} flex items-center justify-center text-[8px] font-bold text-white`}
                            >
                              {initials(n.master.name)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {n.master.name}
                            </span>
                          </div>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          · {timeAgo(n.createdAt)}
                        </span>
                      </div>
                    </div>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
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
