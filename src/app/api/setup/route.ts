import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/setup — инициализация БД дефолтными данными если она пустая
// Безопасно: заливает seed только если в базе НЕТ ни одного мастера.
// Повторные вызовы ничего не меняют.
export async function GET() {
  try {
    const mastersCount = await db.master.count()

    if (mastersCount > 0) {
      return NextResponse.json({
        ok: true,
        alreadyInitialized: true,
        message: `БД уже инициализирована: ${mastersCount} мастеров`,
        masters: mastersCount,
      })
    }

    // ── Создаём дефолтных мастеров ──
    const masters = [
      { name: 'Тимур', pin: '1111', role: 'SENIOR', color: 'emerald' },
      { name: 'Айрат', pin: '2222', role: 'REGULAR', color: 'sky' },
      { name: 'Марат', pin: '3333', role: 'REGULAR', color: 'violet' },
    ]

    const createdMasters = []
    for (const m of masters) {
      const master = await db.master.create({ data: m })
      createdMasters.push(master)
    }

    // ── Создаём демо-справочник табаков ──
    const tobaccos = [
      { brand: 'Darkside', line: 'Supernova', flavor: 'Ice Grape', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Darkside', line: 'Supernova', flavor: 'Cola', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Darkside', line: 'Core', flavor: 'Medium', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Darkside', line: 'Core', flavor: 'Pineapple', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Musthave', line: 'Original', flavor: 'Blast', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Musthave', line: 'Original', flavor: 'Cherry Cola', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Daily Hookah', line: 'Base', flavor: 'Grapefruit', defaultJarGrams: 200, thresholdGrams: 70 },
      { brand: 'Daily Hookah', line: 'Base', flavor: 'Watermelon Mint', defaultJarGrams: 200, thresholdGrams: 70 },
      { brand: 'Tangiers', line: 'Lucid', flavor: 'Cane Mint', defaultJarGrams: 250, thresholdGrams: 70 },
      { brand: 'Burn', line: 'Tobacco', flavor: 'Energy', defaultJarGrams: 250, thresholdGrams: 70 },
    ]

    for (const t of tobaccos) {
      const tobacco = await db.tobacco.create({
        data: {
          brand: t.brand,
          line: t.line,
          flavor: t.flavor,
          defaultJarGrams: t.defaultJarGrams,
          thresholdGrams: t.thresholdGrams,
        },
      })
      // Стартовый остаток — пара позиций "мало" для демонстрации
      const startGrams =
        t.flavor === 'Cola' ? 45 :
        t.flavor === 'Cane Mint' ? 30 :
        t.flavor === 'Medium' ? 50 :
        Math.floor(Math.random() * 280)
      await db.stockItem.create({
        data: { tobaccoId: tobacco.id, currentGrams: startGrams },
      })
    }

    return NextResponse.json({
      ok: true,
      initialized: true,
      message: '✅ БД инициализирована! Создано мастеров: 3, табаков: 10.',
      masters: createdMasters.map((m) => ({
        name: m.name,
        role: m.role,
        pin: m.pin,
      })),
      hint: 'Теперь можешь войти по PIN 1111 (Тимур, старший) или /claim 1111 в Telegram-боте.',
    })
  } catch (e) {
    console.error('Setup error:', e)
    return NextResponse.json(
      {
        ok: false,
        error: 'Ошибка инициализации БД',
        detail: (e as Error).message,
      },
      { status: 500 },
    )
  }
}
