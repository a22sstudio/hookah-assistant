import 'server-only'

import { normalize } from './normalize'

// ───────────────────────────────────────────
// Определение операции по глаголу в тексте.
// ───────────────────────────────────────────

export type OperationType = 'add_incoming' | 'spend' | 'set_stock' | 'query' | 'schedule' | 'unknown'

// Глаголы прихода (+граммы)
const ADD_VERBS = [
  'принял', 'приняло', 'принять', 'принимать',
  'пришло', 'пришли', 'приход',
  'приехало', 'приехали', 'приехал',
  'получил', 'получило',
  'добавь', 'добавил', 'добавить', 'добавлено',
  'прибавь', 'прибавил', 'прибавить',
  'досыпал', 'досыпать', 'досыпь',
  'засыпал', 'засыпать', 'засыпь',
  'пополнил', 'пополнить', 'пополни',
  'приход',
]

// Глаголы расхода (-граммы)
const SPEND_VERBS = [
  'минус', 'отними', 'отнять', 'отнял', 'отнимить',
  'вычти', 'вычесть', 'вычел', 'вычитать',
  'списать', 'списал', 'спиши', 'списывать',
  'ушло', 'ушел', 'ушёл', 'уходить',
  'израсходовал', 'расход', 'расходовать',
  'забил', 'забивать', 'забить',
  'скрутил', 'скрутить', 'скручивать',
  'сделал', 'сделать',
  'сварил', 'сварить',
  'выкурил', 'выкурить',
  'протратил', 'потратить', 'потрачено',
]

// Глаголы установки остатка (=граммы)
const SET_VERBS = [
  'обнови', 'обновить', 'обновил', 'обновлено',
  'остаток', 'осталось', 'остаеться', 'остается',
  'лежит', 'лежать', 'лежало',
  'стоит', 'стоять', 'стояло',
  'в банке', 'в баночке',
  'имею', 'имеется',
  'весит', 'вес', 'взвесил', 'взвесить',
]

// Глаголы запроса
const QUERY_VERBS = [
  'мало', 'чё мало', 'что мало', 'что заказать', 'закажи',
  'чё мало', 'че мало', 'че заказть', 'что нужно',
  'покажи', 'покажы', 'покажите',
  'список', 'перечень',
  'остатки', 'склад', 'чё есть',
]

// Глаголы графика
const SCHEDULE_VERBS = [
  'поставь', 'ставь', 'поставить',
  'работает', 'работал', 'работать',
  'график', 'смена', 'смену',
  'завтра', 'сегодня', 'послезавтра',
  'выходной', 'отдыхает',
]

// Определить операцию по тексту
export function detectOperation(text: string): { type: OperationType; verb: string | null } {
  const normalized = normalize(text)
  
  // Проверяем глаголы прихода
  for (const verb of ADD_VERBS) {
    if (normalized.includes(normalize(verb))) {
      return { type: 'add_incoming', verb }
    }
  }
  
  // Проверяем глаголы расхода
  for (const verb of SPEND_VERBS) {
    if (normalized.includes(normalize(verb))) {
      return { type: 'spend', verb }
    }
  }
  
  // Проверяем глаголы установки остатка
  for (const verb of SET_VERBS) {
    if (normalized.includes(normalize(verb))) {
      return { type: 'set_stock', verb }
    }
  }
  
  // Проверяем глаголы запроса
  for (const verb of QUERY_VERBS) {
    if (normalized.includes(normalize(verb))) {
      return { type: 'query', verb }
    }
  }
  
  // Проверяем глаголы графика
  for (const verb of SCHEDULE_VERBS) {
    if (normalized.includes(normalize(verb))) {
      return { type: 'schedule', verb }
    }
  }
  
  return { type: 'unknown', verb: null }
}

// Проверить, является ли сообщение подтверждением (да/нет/1/2/3)
export function isConfirmation(text: string): 'yes' | 'no' | 'cancel' | number | null {
  const normalized = normalize(text).trim()
  
  if (['да', 'ок', 'подтверждаю', 'верно', 'точно', 'yes', 'y'].includes(normalized)) {
    return 'yes'
  }
  if (['нет', 'no', 'отмена', 'отменить', 'cancel', 'не'].includes(normalized)) {
    return 'no'
  }
  if (['отмена', 'отменить', 'стоп', 'cancel'].includes(normalized)) {
    return 'cancel'
  }
  
  // Число 1-9 — выбор варианта
  const numMatch = normalized.match(/^(\d)$/)
  if (numMatch) {
    const num = parseInt(numMatch[1], 10)
    if (num >= 1 && num <= 9) return num
  }
  
  return null
}

// Все глаголы для удаления из текста
const ALL_VERBS = [...ADD_VERBS, ...SPEND_VERBS, ...SET_VERBS, ...QUERY_VERBS, ...SCHEDULE_VERBS]

// Удалить глагол из текста (чтобы осталось только название табака)
export function removeVerb(text: string): string {
  let normalized = normalize(text)
  
  // Сортируем глаголы по длине (длинные первыми) — чтобы «чё мало» не ломалось на «мало»
  const sortedVerbs = [...ALL_VERBS].sort((a, b) => b.length - a.length)
  
  for (const verb of sortedVerbs) {
    const verbNorm = normalize(verb)
    if (normalized.includes(verbNorm)) {
      normalized = normalized.replace(verbNorm, ' ')
    }
  }
  
  return normalized.replace(/\s+/g, ' ').trim()
}
