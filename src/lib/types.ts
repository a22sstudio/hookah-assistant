// Общие типы для фронтенда

export interface Tobacco {
  id: string
  brand: string
  line: string
  flavor: string
  defaultJarGrams: number
  thresholdGrams: number
  notes: string | null
  currentGrams: number
  updatedAt: string
  isLow: boolean
}

export interface Operation {
  id: string
  type: 'INCOMING' | 'ADJUSTMENT' | 'ORDER' | 'CORRECTION'
  gramsBefore: number
  gramsAfter: number
  delta: number
  source: 'VOICE' | 'PHOTO' | 'MANUAL' | 'TEXT' | 'SYSTEM'
  note: string | null
  rawInput: string | null
  createdAt: string
  tobacco: {
    id: string
    brand: string
    line: string
    flavor: string
  } | null
}

export interface Order {
  id: string
  status: 'PENDING' | 'ORDERED' | 'RECEIVED'
  gramsRequested: number
  note: string | null
  createdAt: string
  resolvedAt: string | null
  tobacco: {
    id: string
    brand: string
    line: string
    flavor: string
    currentGrams: number
  } | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  actions?: Array<{ tool: string; success: boolean; message: string }>
  attachments?: Array<{ type: 'photo' | 'voice'; preview?: string }>
}

export const OPERATION_LABELS: Record<Operation['type'], string> = {
  INCOMING: 'Приход',
  ADJUSTMENT: 'Корректировка',
  ORDER: 'Заявка',
  CORRECTION: 'Правка',
}

export const SOURCE_LABELS: Record<Operation['source'], string> = {
  VOICE: '🎙 Голос',
  PHOTO: '📸 Фото',
  MANUAL: '✋ Вручную',
  TEXT: '💬 Текст',
  SYSTEM: '⚙️ Система',
}

export const ORDER_STATUS_LABELS: Record<Order['status'], string> = {
  PENDING: 'Ожидает',
  ORDERED: 'Заказано',
  RECEIVED: 'Получено',
}

// ============================================
// Система мастеров, смен, хотелок, заявок, нотификаций
// ============================================

export interface Master {
  id: string
  name: string
  role: 'SENIOR' | 'REGULAR'
  color: string
}

export interface ShiftInfo {
  id: string
  masterId: string
  masterName: string
  masterColor: string
  masterRole: string
  status: 'OPEN' | 'CLOSED'
  openedAt: string
  hookahCount: number
  isMine: boolean
}

export interface ShiftsResponse {
  shifts: ShiftInfo[]
  myShift: { id: string; openedAt: string; hookahCount: number } | null
  canOpen: boolean
  isAfterNoon: boolean
}

export interface Wish {
  id: string
  text: string
  status: 'PENDING' | 'DONE'
  createdAt: string
  master: { id: string; name: string; color: string }
  isMine: boolean
}

export interface MasterRequest {
  id: string
  text: string
  grams: number | null
  status: 'PENDING' | 'ORDERED' | 'DONE'
  createdAt: string
  master: { id: string; name: string; color: string }
  isMine: boolean
}

export type AppNotificationType =
  | 'REQUEST'
  | 'FINISHED'
  | 'WISH'
  | 'SHIFT_OPEN'
  | 'SHIFT_CLOSE'
  | 'LOW_STOCK'

export interface AppNotification {
  id: string
  type: AppNotificationType
  message: string
  read: boolean
  createdAt: string
  master: { id: string; name: string; color: string } | null
}

export const WISH_STATUS_LABELS: Record<Wish['status'], string> = {
  PENDING: 'Ожидает',
  DONE: 'Выполнено',
}

export const REQUEST_STATUS_LABELS: Record<MasterRequest['status'], string> = {
  PENDING: 'Ожидает',
  ORDERED: 'Заказано',
  DONE: 'Готово',
}
