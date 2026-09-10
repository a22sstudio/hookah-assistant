// scripts/set-webhook.ts
// Настраивает Telegram webhook на указанный URL.
// Использование:
//   bun run scripts/set-webhook.ts https://your-app.up.railway.app
//   WEBHOOK_URL=https://your-app.up.railway.app bun run scripts/set-webhook.ts

import 'dotenv/config'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const url = process.argv[2] || process.env.WEBHOOK_URL

if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env')
  process.exit(1)
}
if (!url) {
  console.error('❌ Укажи URL: bun run scripts/set-webhook.ts https://your-app.up.railway.app')
  console.error('   или задай WEBHOOK_URL в .env')
  process.exit(1)
}

const webhookUrl = url.replace(/\/$/, '') + '/api/telegram/webhook'

async function main() {
  console.log(`🔗 Устанавливаю webhook: ${webhookUrl}`)
  const res = await fetch(
    `https://api.telegram.org/bot${TOKEN}/setWebhook`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl, allowed_updates: ['message', 'edited_message', 'callback_query'] }),
    },
  )
  const data = await res.json()
  if (data.ok) {
    console.log(`✅ Webhook установлен: ${data.result}`)
    console.log(`   Бот теперь получает Update на: ${webhookUrl}`)
  } else {
    console.error(`❌ Ошибка: ${data.description}`)
    process.exit(1)
  }
}

main()
