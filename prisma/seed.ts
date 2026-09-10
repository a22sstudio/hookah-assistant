import { db } from '../src/lib/db'

// Мастера кальянной
const SEED_MASTERS = [
  { name: 'Тимур', pin: '1111', role: 'SENIOR', color: 'emerald' },
  { name: 'Айрат', pin: '2222', role: 'REGULAR', color: 'sky' },
  { name: 'Марат', pin: '3333', role: 'REGULAR', color: 'violet' },
]

// Стартовый справочник табаков (популярные позиции)
// Вес банки и порог "мало" — настраиваемые. Порог 70г по умолчанию.
const SEED_TOBACCOS = [
  // Darkside
  { brand: 'Darkside', line: 'Supernova', flavor: 'Ice Grape', defaultJarGrams: 250 },
  { brand: 'Darkside', line: 'Supernova', flavor: 'Cola', defaultJarGrams: 250 },
  { brand: 'Darkside', line: 'Core', flavor: 'Medium', defaultJarGrams: 250 },
  { brand: 'Darkside', line: 'Core', flavor: 'Pineapple', defaultJarGrams: 250 },
  // Musthave
  { brand: 'Musthave', line: 'Original', flavor: 'Blast', defaultJarGrams: 250 },
  { brand: 'Musthave', line: 'Original', flavor: 'Cherry Cola', defaultJarGrams: 250 },
  { brand: 'Musthave', line: 'The Boost', flavor: 'Banana', defaultJarGrams: 100 },
  // Daily Hookah
  { brand: 'Daily Hookah', line: 'Base', flavor: 'Grapefruit', defaultJarGrams: 200 },
  { brand: 'Daily Hookah', line: 'Base', flavor: 'Watermelon Mint', defaultJarGrams: 200 },
  // Tangiers
  { brand: 'Tangiers', line: 'Lucid', flavor: 'Cane Mint', defaultJarGrams: 250 },
  // Burn
  { brand: 'Burn', line: 'Tobacco', flavor: 'Energy', defaultJarGrams: 250 },
]

async function main() {
  console.log('🌱 Seeding database...')

  for (const t of SEED_TOBACCOS) {
    const tobacco = await db.tobacco.upsert({
      where: {
        brand_line_flavor: { brand: t.brand, line: t.line, flavor: t.flavor },
      },
      update: {},
      create: {
        ...t,
        thresholdGrams: 70,
      },
    })

    // Создаём StockItem если его нет, со случайным стартовым остатком
    await db.stockItem.upsert({
      where: { tobaccoId: tobacco.id },
      update: {},
      create: {
        tobaccoId: tobacco.id,
        // даём разные стартовые остатки для демонстрации
        currentGrams: Math.floor(Math.random() * 280),
      },
    })
  }

  // Делаем пару позиций "мало" (< 70г) чтобы дашборд был живой
  const darkside = await db.tobacco.findFirst({
    where: { brand: 'Darkside', line: 'Supernova', flavor: 'Cola' },
  })
  if (darkside) {
    await db.stockItem.update({
      where: { tobaccoId: darkside.id },
      data: { currentGrams: 45 },
    })
    await db.operation.create({
      data: {
        tobaccoId: darkside.id,
        type: 'CORRECTION',
        gramsBefore: 0,
        gramsAfter: 45,
        delta: 45,
        source: 'SYSTEM',
        note: 'Seed: стартовый остаток',
      },
    })
  }

  const tangiers = await db.tobacco.findFirst({
    where: { brand: 'Tangiers', flavor: 'Cane Mint' },
  })
  if (tangiers) {
    await db.stockItem.update({
      where: { tobaccoId: tangiers.id },
      data: { currentGrams: 30 },
    })
    await db.operation.create({
      data: {
        tobaccoId: tangiers.id,
        type: 'CORRECTION',
        gramsBefore: 0,
        gramsAfter: 30,
        delta: 30,
        source: 'SYSTEM',
        note: 'Seed: стартовый остаток',
      },
    })
  }

  // Добавим одну приходную операцию для истории
  const musthave = await db.tobacco.findFirst({
    where: { brand: 'Musthave', flavor: 'Blast' },
  })
  if (musthave) {
    const stock = await db.stockItem.findUnique({ where: { tobaccoId: musthave.id } })
    if (stock) {
      await db.stockItem.update({
        where: { tobaccoId: musthave.id },
        data: { currentGrams: 250 },
      })
      await db.operation.create({
        data: {
          tobaccoId: musthave.id,
          type: 'INCOMING',
          gramsBefore: 0,
          gramsAfter: 250,
          delta: 250,
          source: 'MANUAL',
          note: 'Seed: приход 1 банка 250г',
        },
      })
    }
  }

  const count = await db.tobacco.count()
  const stockCount = await db.stockItem.count()

  // Мастера
  for (const m of SEED_MASTERS) {
    await db.master.upsert({
      where: { pin: m.pin },
      update: {},
      create: m,
    })
  }

  // Демо-смена: Айрат на смене с 5 кальянами (открыта 2 часа назад)
  const airat = await db.master.findFirst({ where: { name: 'Айрат' } })
  if (airat) {
    const existingShift = await db.shift.findFirst({ where: { masterId: airat.id, status: 'OPEN' } })
    if (!existingShift) {
      await db.shift.create({
        data: {
          masterId: airat.id,
          status: 'OPEN',
          openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
          hookahCount: 5,
        },
      })
    }
  }

  // Демо-нотификация для старшего
  const timur = await db.master.findFirst({ where: { name: 'Тимур' } })
  if (timur && airat) {
    const notifCount = await db.notification.count()
    if (notifCount === 0) {
      await db.notification.create({
        data: {
          type: 'FINISHED',
          message: 'Айрат отметил: заканчивается Darkside Supernova Cola',
          masterId: airat.id,
        },
      })
    }
  }

  const masterCount = await db.master.count()
  const shiftCount = await db.shift.count()
  console.log(`✅ Seeded ${count} tobaccos, ${stockCount} stock items, ${masterCount} masters, ${shiftCount} shifts`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
