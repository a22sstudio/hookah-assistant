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
  // Поставка (массовая операция)
  'поставка', 'поставку', 'поставил', 'поставила',
  'завоз', 'завозили', 'завезли', 'завёз',
  'проверка', 'инвентаризация',
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
  'пусто', 'кончился', 'закончился', 'нету',
  'новый', 'новая',
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

// Определить операцию по тексту (с word-boundary, не substring)
export function detectOperation(text: string): { type: OperationType; verb: string | null } {
  const normalized = normalize(text)
  
  // Проверяем по спискам глаголов, используя word boundaries
  const checkList = (list: string[]): string | null => {
    // Сортируем по длине (длинные первыми) — «чё мало» перед «мало»
    const sorted = [...list].sort((a, b) => b.length - a.length)
    for (const verb of sorted) {
      const verbNorm = normalize(verb)
      const pattern = new RegExp(`(^|\\s)${escapeRegex(verbNorm)}(\\s|$)`, 'i')
      if (pattern.test(normalized)) return verb
    }
    return null
  }
  
  // Проверяем в порядке приоритета
  // ВАЖНО: query и schedule проверяем ПОСЛЕ add/spend/set, чтобы «мало» не перехватывало раньше
  const addVerb = checkList(ADD_VERBS)
  if (addVerb) return { type: 'add_incoming', verb: addVerb }
  
  const spendVerb = checkList(SPEND_VERBS)
  if (spendVerb) return { type: 'spend', verb: spendVerb }
  
  const setVerb = checkList(SET_VERBS)
  if (setVerb) return { type: 'set_stock', verb: setVerb }
  
  const queryVerb = checkList(QUERY_VERBS)
  if (queryVerb) return { type: 'query', verb: queryVerb }
  
  const scheduleVerb = checkList(SCHEDULE_VERBS)
  if (scheduleVerb) return { type: 'schedule', verb: scheduleVerb }
  
  return { type: 'unknown', verb: null }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Все глаголы для удаления из текста
const ALL_VERBS = [...ADD_VERBS, ...SPEND_VERBS, ...SET_VERBS, ...QUERY_VERBS, ...SCHEDULE_VERBS]

// Удалить глагол из текста (с word-boundary)
export function removeVerb(text: string): string {
  let normalized = normalize(text)
  
  const sortedVerbs = [...ALL_VERBS].sort((a, b) => b.length - a.length)
  
  for (const verb of sortedVerbs) {
    const verbNorm = normalize(verb)
    const pattern = new RegExp(`(^|\\s)${escapeRegex(verbNorm)}(\\s|$)`, 'gi')
    normalized = normalized.replace(pattern, ' ')
  }
  
  return normalized.replace(/\s+/g, ' ').trim()
}

// Проверить, является ли сообщение подтверждением (да/нет/1/2/3)
export function isConfirmation(text: string): 'yes' | 'no' | 'cancel' | number | null {
  const normalized = normalize(text).trim()
  
  // Да
  if (['да', 'ок', 'окей', 'подтверждаю', 'верно', 'точно', 'именно', 'конечно', 'ага', 'угу', 'yes', 'y', 'даа', 'дада', 'дадада'].includes(normalized) 
      || normalized.startsWith('да ')) {
    return 'yes'
  }
  // Нет
  if (['нет', 'no', 'не', 'неа', 'не-а', 'ноу', 'n'].includes(normalized)) {
    return 'no'
  }
  // Отмена
  if (['отмена', 'отменить', 'отмени', 'стоп', 'cancel', 'abort'].includes(normalized)) {
    return 'cancel'
  }
  
  // Число 1-9999 — может быть выбор варианта ИЛИ количество грамм
  // Если есть сессия no_quantity → это граммы
  // Если есть сессия ambiguous → это выбор варианта (1-9)
  // Контекст определяет вызывающий код
  const numMatch = normalized.match(/^(\d{1,4})$/)
  if (numMatch) {
    const num = parseInt(numMatch[1], 10)
    if (num >= 1 && num <= 9999) return num
  }
  
  return null
}
