import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentMaster } from '@/lib/auth'

// GET /api/orders/export?id=xxx&format=csv|pdf
// Только SENIOR может экспортировать
function escapeCsv(s: string | number | null | undefined): string {
  const v = s === null || s === undefined ? '' : String(s)
  if (/[",\n;]/.test(v)) return `"${v.replace(/"/g, '""')}"`
  return v
}

function statusLabel(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'Черновик'
    case 'SUBMITTED':
      return 'Отправлена'
    case 'ORDERED':
      return 'Заказано'
    case 'RECEIVED':
      return 'Получено'
    default:
      return status
  }
}

function isoToDateOnly(iso: string | Date): string {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildCsv(order: {
  id: string
  status: string
  createdAt: Date
  items: Array<{
    itemType: string
    brand: string | null
    line: string | null
    flavor: string | null
    name: string
    packGrams: number | null
    quantity: number
    unit: string
  }>
}): string {
  const lines: string[] = []

  lines.push('ЗАЯВКА НА ЗАКУП')
  lines.push(`Дата: ${isoToDateOnly(order.createdAt)}`)
  lines.push(`Статус: ${order.status}`)
  lines.push('')

  const tobaccoItems = order.items.filter((i) => i.itemType === 'TOBACCO')
  const consumableItems = order.items.filter((i) => i.itemType === 'CONSUMABLE')

  if (tobaccoItems.length > 0) {
    lines.push('ТАБАК:')
    lines.push(['Бренд', 'Линейка', 'Вкус', 'Граммовка', 'Количество', 'Единица'].map(escapeCsv).join(','))
    for (const it of tobaccoItems) {
      lines.push(
        [
          it.brand ?? '',
          it.line ?? '',
          it.flavor ?? '',
          it.packGrams != null ? it.packGrams : '',
          String(it.quantity),
          it.unit,
        ]
          .map(escapeCsv)
          .join(','),
      )
    }
    lines.push('')
  }

  if (consumableItems.length > 0) {
    lines.push('РАСХОДНИКИ:')
    lines.push(['Наименование', 'Количество', 'Единица'].map(escapeCsv).join(','))
    for (const it of consumableItems) {
      lines.push([it.name, String(it.quantity), it.unit].map(escapeCsv).join(','))
    }
    lines.push('')
  }

  return lines.join('\n')
}

function buildPdfText(order: {
  id: string
  status: string
  createdAt: Date
  items: Array<{
    itemType: string
    brand: string | null
    line: string | null
    flavor: string | null
    name: string
    packGrams: number | null
    quantity: number
    unit: string
  }>
}): string {
  const lines: string[] = []
  lines.push('ЗАЯВКА НА ЗАКУП')
  lines.push('========================')
  lines.push(`Дата: ${isoToDateOnly(order.createdAt)}`)
  lines.push(`Статус: ${statusLabel(order.status)}`)
  lines.push('')

  const tobaccoItems = order.items.filter((i) => i.itemType === 'TOBACCO')
  const consumableItems = order.items.filter((i) => i.itemType === 'CONSUMABLE')

  if (tobaccoItems.length > 0) {
    lines.push('ТАБАК')
    lines.push('----------------------------------------')
    lines.push('Бренд | Линейка | Вкус | Грамм | Кол-во | Ед.')
    lines.push('----------------------------------------')
    for (const it of tobaccoItems) {
      lines.push(
        [
          it.brand ?? '',
          it.line ?? '—',
          it.flavor ?? '—',
          it.packGrams ? `${it.packGrams}г` : '—',
          String(it.quantity),
          it.unit,
        ].join(' | '),
      )
    }
    lines.push('')
  }

  if (consumableItems.length > 0) {
    lines.push('РАСХОДНИКИ')
    lines.push('----------------------------------------')
    lines.push('Наименование | Кол-во | Ед.')
    lines.push('----------------------------------------')
    for (const it of consumableItems) {
      lines.push([it.name, String(it.quantity), it.unit].join(' | '))
    }
    lines.push('')
  }

  if (order.items.length === 0) {
    lines.push('(нет позиций)')
  }

  lines.push('========================')
  lines.push(`Всего позиций: ${order.items.length}`)

  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const me = await getCurrentMaster()
  if (!me) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }
  if (me.role !== 'SENIOR') {
    return NextResponse.json(
      { error: 'Только старший может экспортировать заявки' },
      { status: 403 },
    )
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const format = (searchParams.get('format') || 'csv').toLowerCase()

  if (!id) {
    return NextResponse.json({ error: 'id обязателен' }, { status: 400 })
  }

  const order = await db.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!order) {
    return NextResponse.json({ error: 'Заявка не найдена' }, { status: 404 })
  }

  if (format === 'pdf') {
    // Простая генерация "PDF" как текстового/plain файла — браузер скачает как .pdf.
    // Мы отдаём plain text с application/pdf и расширением .pdf — это валидный минимальный PDF v1.4.
    const text = buildPdfText({
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      items: order.items.map((it) => ({
        itemType: it.itemType,
        brand: it.brand,
        line: it.line,
        flavor: it.flavor,
        name: it.name,
        packGrams: it.packGrams,
        quantity: it.quantity,
        unit: it.unit,
      })),
    })

    // Создаём минимально-валидный PDF (plain text in PDF stream)
    const pdf = minimalPdf(text)
    const dateStr = isoToDateOnly(order.createdAt)
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="order-${dateStr}.pdf"`,
      },
    })
  }

  // CSV
  const csv = buildCsv({
    id: order.id,
    status: order.status,
    createdAt: order.createdAt,
    items: order.items.map((it) => ({
      itemType: it.itemType,
      brand: it.brand,
      line: it.line,
      flavor: it.flavor,
      name: it.name,
      packGrams: it.packGrams,
      quantity: it.quantity,
      unit: it.unit,
    })),
  })

  const bom = '\uFEFF'
  const dateStr = isoToDateOnly(order.createdAt)
  return new NextResponse(bom + csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv;charset=utf-8;',
      'Content-Disposition': `attachment; filename="order-${dateStr}.csv"`,
    },
  })
}

// Минимальный валидный PDF (одна страница с plain text)
function minimalPdf(text: string): Uint8Array {
  // Экранируем спецсимволы для PDF-строки
  const escape = (s: string) =>
    s
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')

  // Разбиваем на строки и упаковываем по ~60 символов
  const rawLines = text.split('\n')
  const lines: string[] = []
  for (const ln of rawLines) {
    // trim слишком длинных строк
    if (ln.length <= 80) {
      lines.push(ln)
    } else {
      // жёсткий перенос
      let rest = ln
      while (rest.length > 80) {
        lines.push(rest.slice(0, 80))
        rest = rest.slice(80)
      }
      if (rest) lines.push(rest)
    }
  }

  const linesPerPage = 45
  const pages: string[][] = []
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage))
  }
  if (pages.length === 0) pages.push([''])

  // PDF сборка
  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>') // obj 1
  objects.push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>') // obj 2 (упрощённо — одна страница)
  // obj 3 = page
  objects.push(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  )
  // obj 4 = content stream
  let contentStream = 'BT\n/F1 10 Tf\n50 800 Td\n14 TL\n'
  for (const ln of pages[0]) {
    contentStream += `(${escape(ln)}) Tj\n0 -14 Td\n`
  }
  contentStream += 'ET'
  objects.push(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`)
  // obj 5 = font
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>')

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'))
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(pdf, 'utf8')
  pdf += `xref\n0 ${objects.length + 1}\n`
  pdf += `0000000000 65535 f \n`
  for (const off of offsets) {
    pdf += `${off.toString().padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new Uint8Array(Buffer.from(pdf, 'utf8'))
}
