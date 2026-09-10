// scripts/delete-webhook.ts
// Удаляет webhook — переключает бота обратно в polling режим
import 'dotenv/config'

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN не задан в .env')
  process.exit(1)
}

async function main() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/deleteWebhook`, {
    method: 'POST',
  })
  const data = await res.json()
  if (data.ok) {
    console.log('✅ Webhook удалён. Бот переключён в polling режим.')
    console.log('   Для локальной разработки используй USE_POLLING=1 в .env')
  } else {
    console.error(`❌ ${data.description}`)
    process.exit(1)
  }
}

main()
