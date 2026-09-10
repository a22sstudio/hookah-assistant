// scripts/webhook-info.ts
// Показывает текущий статус webhook
import 'dotenv/config'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env')
  process.exit(1)
}

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`)
  const data = await res.json()
  if (!data.ok) {
    console.error(`❌ ${data.description}`)
    process.exit(1)
  }
  const info = data.result
  console.log('=== Telegram Webhook Info ===')
  console.log(`URL: ${info.url || '(не задан — polling режим)'}`)
  console.log(`Pending updates: ${info.pending_update_count}`)
  console.log(`Max connections: ${info.max_connections}`)
  if (info.last_error_date) {
    console.log(`⚠️ Последняя ошибка: ${info.last_error_message} (${new Date(info.last_error_date * 1000).toISOString()})`)
  } else {
    console.log('✅ Без ошибок')
  }
}

main()
