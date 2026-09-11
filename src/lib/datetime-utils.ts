// Утилиты для работы с датами, расписанием и парсинга русских фраз

// Получить дату начала дня (00:00 локально)
export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Получить дату начала следующего дня
export function startOfNextDay(d: Date = new Date()): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() + 1)
  return x
}

// Прибавить N дней к дате (00:00)
export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d)
  x.setDate(x.getDate() + n)
  return x
}

// Формат даты YYYY-MM-DD (для ключей)
export function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10)
}

// Формат даты для отображения (5 сентября)
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]
const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]
const WEEKDAYS = [
  'воскресенье', 'понедельник', 'вторник', 'среда',
  'четверг', 'пятница', 'суббота',
]

export function formatDateRu(d: Date = new Date()): string {
  return `${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

export function formatFullDateRu(d: Date = new Date()): string {
  const weekday = WEEKDAYS[d.getDay()]
  return `${weekday}, ${d.getDate()} ${MONTHS_GENITIVE[d.getMonth()]}`
}

export function weekdayRu(d: Date = new Date()): string {
  return WEEKDAYS[d.getDay()]
}

export function monthRu(d: Date = new Date()): string {
  return MONTHS_NOMINATIVE[d.getMonth()]
}

// Парсинг дня недели из текста → ближайшая дата
const WEEKDAY_MAP: Record<string, number> = {
  понедельник: 1, пн: 1, monday: 1,
  вторник: 2, вт: 2, tuesday: 2,
  среда: 3, среду: 3, среды: 3, ср: 3, wednesday: 3,
  четверг: 4, чт: 4, thursday: 4,
  пятница: 5, пятницу: 5, пт: 5, friday: 5,
  суббота: 6, субботу: 6, сб: 6, saturday: 6,
  воскресенье: 0, воскресения: 0, вс: 0, sunday: 0,
  сегодня: -1, сегодняшний: -1,
  завтра: -2, завтрашний: -2,
  послезавтра: -3,
}

// Найти дату по фразе на русском → Date | null
// "23 числа" → 23 число текущего/следующего месяца
// "в четверг" → ближайший четверг
// "сегодня"/"завтра"
export function parseDateFromText(text: string, baseDate: Date = new Date()): Date | null {
  const t = text.toLowerCase().trim()

  // "сегодня" / "завтра" / "послезавтра"
  if (/сегодня/.test(t)) return startOfDay(baseDate)
  if (/послезавтра/.test(t)) return addDays(startOfDay(baseDate), 2)
  if (/завтра/.test(t)) return addDays(startOfDay(baseDate), 1)

  // "23 числа" / "23 го" / "23"
  const dateMatch = t.match(/\b(\d{1,2})(?:\s+(?:числа|го|е))?(\s+(?:январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр))?/)
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10)
    if (day >= 1 && day <= 31) {
      const today = startOfDay(baseDate)
      const result = new Date(today)
      result.setDate(day)
      result.setMonth(today.getMonth())
      // Если день уже прошёл → следующий месяц
      if (result < today) {
        result.setMonth(result.getMonth() + 1)
      }
      return result
    }
  }

  // День недели → ближайший будущий
  for (const [word, offset] of Object.entries(WEEKDAY_MAP)) {
    if (t.includes(word)) {
      if (offset === -1) return startOfDay(baseDate) // сегодня
      if (offset === -2) return addDays(startOfDay(baseDate), 1) // завтра
      if (offset === -3) return addDays(startOfDay(baseDate), 2) // послезавтра
      // 0=воскресенье, 1=понедельник, ..., 6=суббота
      const today = startOfDay(baseDate)
      const todayDow = today.getDay()
      let daysAhead = offset - todayDow
      if (daysAhead <= 0) daysAhead += 7
      return addDays(today, daysAhead)
    }
  }

  return null
}

// Парсинг количества кальянов из фразы
// "забил 5 кальянов", "сделал 3", "накрутил 10", "+5", "5 штук"
const HOOKAH_VERBS = [
  'забил', 'забил', 'сделал', 'накрутил', 'накрутил',
  'сварил', 'сварил', 'забил', 'забивал', 'забиваю',
  'сделал', 'делал', 'делаю', 'накрутил', 'накручиваю',
  'почистил', 'забил',
]

export function parseHookahCount(text: string): number | null {
  const t = text.toLowerCase().trim()

  // "+5" / "+ 5"
  const plusMatch = t.match(/^\+\s*(\d{1,3})/)
  if (plusMatch) {
    const n = parseInt(plusMatch[1], 10)
    if (n >= 1 && n <= 100) return n
  }

  // "5 кальянов" / "5 штук" / "5 шт"
  const countMatch = t.match(/\b(\d{1,3})\s*(?:кальян|штук|шт|к|куск)?/)
  if (countMatch) {
    const n = parseInt(countMatch[1], 10)
    if (n >= 1 && n <= 100) return n
  }

  // Словом: "пять", "десять"
  const wordNumbers: Record<string, number> = {
    один: 1, одна: 1, два: 2, две: 2, три: 3, четыре: 4, пять: 5,
    шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
    одиннадцать: 11, двенадцать: 12, пятнадцать: 15, двадцать: 20,
  }
  for (const [word, num] of Object.entries(wordNumbers)) {
    if (t.includes(word)) return num
  }

  // Если есть глагол «забил/сделал» без числа — это +1
  if (HOOKAH_VERBS.some((v) => t.includes(v))) {
    if (!/\d/.test(t) && !Object.keys(wordNumbers).some((w) => t.includes(w))) {
      return 1
    }
  }

  return null
}

// Формат длительности (часы и минуты)
export function formatDuration(from: Date, to: Date = new Date()): string {
  const ms = to.getTime() - from.getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}ч ${m}м` : `${h}ч`
}
