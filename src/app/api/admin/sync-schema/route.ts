import { NextRequest, NextResponse } from 'next/server'
import { getCurrentMaster } from '@/lib/auth'
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import path from 'path'

// POST /api/admin/sync-schema — запускает prisma db push программно.
// Нужно только когда Railway не подхватил обновление схемы автоматически.
// Доступ: только SENIOR + специальный секретный токен.
export async function POST(req: NextRequest) {
  try {
    const me = await getCurrentMaster()
    if (!me) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    if (me.role !== 'SENIOR') {
      return NextResponse.json({ error: 'Только старший' }, { status: 403 })
    }

    // Проверка секретного токена (двойная защита)
    const authHeader = req.headers.get('x-admin-token')
    const expectedToken = process.env.BOT_SECRET || 'hookah-secret-2024'
    if (authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Неверный admin токен' }, { status: 403 })
    }

    // Определяем тип БД по DATABASE_URL
    const dbUrl = process.env.DATABASE_URL || ''
    const isPostgres = dbUrl.startsWith('postgres')
    const schemaPath = path.join(process.cwd(), 'prisma', 'schema.prisma')

    if (!existsSync(schemaPath)) {
      return NextResponse.json(
        { error: 'Файл schema.prisma не найден', cwd: process.cwd() },
        { status: 500 },
      )
    }

    // Запускаем prisma db push через локальный бинарь (без npx — иначе ставит RC версии)
    const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
    const cmd = `"${prismaBin}" db push --accept-data-loss --schema=${schemaPath} 2>&1`
    let output = ''
    let exitCode = 0
    try {
      output = execSync(cmd, {
        encoding: 'utf-8',
        timeout: 60_000,
        env: process.env,
        cwd: process.cwd(),
        maxBuffer: 1024 * 1024 * 5,
      })
    } catch (e) {
      output = (e as { stdout?: string; stderr?: string; message: string }).stdout
        || (e as { stdout?: string; stderr?: string }).stderr
        || (e as Error).message
      exitCode = 1
    }

    // Дополнительно — сгенерировать клиента (тоже через локальный бинарь)
    try {
      const genOutput = execSync(
        `"${prismaBin}" generate --schema=${schemaPath} 2>&1`,
        {
          encoding: 'utf-8',
          timeout: 60_000,
          env: process.env,
          cwd: process.cwd(),
          maxBuffer: 1024 * 1024 * 5,
        },
      )
      output += '\n--- generate ---\n' + genOutput
    } catch (e) {
      output += '\n--- generate error ---\n' + (e as Error).message
    }

    return NextResponse.json({
      ok: exitCode === 0,
      exitCode,
      dbType: isPostgres ? 'postgresql' : 'sqlite',
      output: output.slice(-3000),
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('sync-schema error:', e)
    return NextResponse.json(
      { error: 'sync-schema failed', detail: (e as Error).message },
      { status: 500 },
    )
  }
}
