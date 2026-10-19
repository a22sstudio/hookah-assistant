import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'
import { startOfDay } from '@/lib/datetime-utils'

const SHIFT_RATES: Record<string, number> = {
  full: 4400,
  morning: 2200,
  evening: 2200,
}

// GET /api/my-income — доход текущего мастера
export async function GET() {
  const me = await getCurrentMaster()
  if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-11
  const today = now.getDate()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Период текущего месяца
  const monthStart = startOfDay(new Date(year, month, 1))
  const monthEnd = startOfDay(new Date(year, month + 1, 0))

  // Все смены мастера в текущем месяце
  const entries = await db.scheduleEntry.findMany({
    where: {
      masterId: me.id,
      date: { gte: monthStart, lt: new Date(year, month + 1, 1) },
    },
    orderBy: { date: 'asc' },
  })

  // Разделяем на первую (1-15) и вторую (16-конец) половины
  const firstHalfShifts = entries.filter((e) => new Date(e.date).getDate() <= 15)
  const secondHalfShifts = entries.filter((e) => new Date(e.date).getDate() > 15)

  const calcSum = (shifts: typeof entries) => {
    let sum = 0
    const breakdown: Record<string, { count: number; rate: number; sum: number }> = {
      full: { count: 0, rate: SHIFT_RATES.full, sum: 0 },
      morning: { count: 0, rate: SHIFT_RATES.morning, sum: 0 },
      evening: { count: 0, rate: SHIFT_RATES.evening, sum: 0 },
    }
    for (const s of shifts) {
      const st = s.shiftType || 'full'
      const rate = SHIFT_RATES[st] ?? SHIFT_RATES.full
      sum += rate
      if (breakdown[st]) {
        breakdown[st].count++
        breakdown[st].sum += rate
      }
    }
    return { sum, breakdown }
  }

  const firstHalf = calcSum(firstHalfShifts)
  const secondHalf = calcSum(secondHalfShifts)

  // Проверяем: зафиксирована ли первая половина (день >= 15)
  const isFirstHalfFrozen = today >= 15

  // Проверяем: зафиксирована ли вторая половина (последний день месяца)
  const isSecondHalfFrozen = today >= daysInMonth

  // Текущий накапливающийся доход (не зафиксированная часть)
  let currentIncome = 0
  let currentShifts: typeof entries = []

  if (!isFirstHalfFrozen) {
    // До 15-го: накапливаем первую половину
    currentIncome = firstHalf.sum
    currentShifts = firstHalfShifts
  } else if (!isSecondHalfFrozen) {
    // После 15-го, до конца месяца: накапливаем вторую половину
    currentIncome = secondHalf.sum
    currentShifts = secondHalfShifts
  } else {
    // Месяц закончен
    currentIncome = 0
    currentShifts = []
  }

  // Премия за текущий месяц
  const bonus = await db.bonus.findUnique({
    where: { masterId_year_month: { masterId: me.id, year, month: month + 1 } },
  })

  // Закрытые расчётные листы (предыдущие месяцы)
  const payslips = await db.payslip.findMany({
    where: { masterId: me.id },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 6,
  })

  // Если есть премия за текущий месяц и месяц закрыт — формируем расчётный лист
  const monthClosed = isSecondHalfFrozen && !!bonus

  return NextResponse.json({
    currentMonth: {
      year,
      month: month + 1,
      monthName: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][month],
      today,
      daysInMonth,
      isFirstHalfFrozen,
      isSecondHalfFrozen,
      isClosed: monthClosed,
    },
    // Первая половина (1-15)
    firstHalf: {
      amount: firstHalf.sum,
      shiftCount: firstHalfShifts.length,
      breakdown: firstHalf.breakdown,
      shifts: firstHalfShifts.map((s) => ({
        date: s.date,
        shiftType: s.shiftType,
        rate: SHIFT_RATES[s.shiftType || 'full'],
      })),
      frozen: isFirstHalfFrozen,
      dueDate: '25 числа текущего месяца',
    },
    // Вторая половина (16-конец)
    secondHalf: {
      amount: secondHalf.sum,
      shiftCount: secondHalfShifts.length,
      breakdown: secondHalf.breakdown,
      shifts: secondHalfShifts.map((s) => ({
        date: s.date,
        shiftType: s.shiftType,
        rate: SHIFT_RATES[s.shiftType || 'full'],
      })),
      frozen: isSecondHalfFrozen,
      dueDate: '10 числа следующего месяца',
    },
    // Текущий накапливающийся доход
    currentIncome,
    currentShifts: currentShifts.map((s) => ({
      date: s.date,
      shiftType: s.shiftType,
      rate: SHIFT_RATES[s.shiftType || 'full'],
    })),
    // Премия
    bonus: bonus ? { amount: bonus.amount, note: bonus.note } : null,
    // Общая сумма за месяц
    monthTotal: firstHalf.sum + secondHalf.sum + (bonus?.amount || 0),
    // Закрытые расчётные листы
    payslips: payslips.map((p) => ({
      id: p.id,
      year: p.year,
      month: p.month,
      monthName: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'][p.month - 1],
      firstHalfAmount: p.firstHalfAmount,
      secondHalfAmount: p.secondHalfAmount,
      bonusAmount: p.bonusAmount,
      totalAmount: p.totalAmount,
      createdAt: p.createdAt,
    })),
    rates: SHIFT_RATES,
  })
}
