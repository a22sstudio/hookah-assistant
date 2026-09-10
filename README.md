# 🌿 Кальянный ассистент

AI-система учёта табака и управления сменой для кальянной.
Старший кальянный мастер + обычные мастера. Веб-панель + Telegram-бот.

## Возможности

- **Старший мастер**: склад, приход по накладным (фото), заявки мастеров, хотелки, live-дашборд смены, управление командой
- **Обычный мастер**: своя смена, счётчик кальянов, заявки на закуп, хотелки, AI-чат
- **AI-движок** (через `z-ai-web-dev-sdk`): понимает речь «пол банки», «закончился», распознаёт накладные по фото, транскрибирует голосовые
- **Доступ**: PIN-код для веб-панели, `/claim PIN` для Telegram-бота (whitelist по telegramId)
- **Роли**: SENIOR (полный доступ) / REGULAR (только своё)

## Демо-аккаунты

| Роль | Имя | PIN |
|---|---|---|
| Старший | Тимур | `1111` |
| Мастер | Айрат | `2222` |
| Мастер | Марат | `3333` |

## Стек

- **Next.js 16** (App Router) + TypeScript
- **Tailwind CSS 4** + **shadcn/ui**
- **Prisma ORM** (SQLite для локалки / PostgreSQL для продакшена)
- **z-ai-web-dev-sdk** (LLM, VLM, ASR)
- **Telegraf** (Telegram-бот, живёт внутри процесса Next.js)

---

## Локальная разработка

### 1. Установка

```bash
bun install
```

### 2. Настройка окружения

```bash
cp .env.example .env
# отредактируй .env: подставь TELEGRAM_BOT_TOKEN (от @BotFather)
```

### 3. База данных (SQLite)

```bash
bun run db:push      # создать таблицы
bun run db:seed      # наполнить демо-данными
```

### 4. Запуск dev-сервера

```bash
bun run dev
```

Открой http://localhost:3000 — вход по PIN-коду.

В dev-режиме Telegram-бот работает через **polling** (постоянный опрос Telegram API).
В production — через **webhook** (Telegram сам присылает сообщения).

---

## Деплой на Railway (рекомендуется)

### Шаг 1. Залить код на GitHub

```bash
git init
git add .
git commit -m "Initial commit: hookah assistant"
# ВАЖНО: проверь что .env НЕ в git (он в .gitignore)
git remote add origin https://github.com/ТВОЙ_ЛОГИН/hookah-assistant.git
git push -u origin main
```

### Шаг 2. Создать проект на Railway

1. Зайди на [railway.app](https://railway.app), войди через GitHub
2. **New Project** → **Deploy from GitHub repo** → выбери свой репозиторий
3. Railway определит Dockerfile автоматически

### Шаг 3. Добавить PostgreSQL

1. В проекте: **New** → **Database** → **PostgreSQL**
2. Railway создаст БД и выдаст `DATABASE_URL` (в формате `postgresql://...`)

### Шаг 4. Переключить Prisma на PostgreSQL

Локально (или через Railway Variables):
```bash
bun run db:use-postgres   # копирует prisma/schema.postgres.prisma → prisma/schema.prisma
# закоммить и запушить
git add prisma/schema.prisma
git commit -m "Switch to PostgreSQL"
git push
```

### Шаг 5. Задать переменные окружения

В Railway → твой сервис → **Variables**:

| Ключ | Значение |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (референс на БД Railway) |
| `TELEGRAM_BOT_TOKEN` | твой токен от @BotFather |
| `BOT_SECRET` | любая случайная строка (например `openssl rand -hex 32`) |
| `NEXT_API_URL` | `https://твой-апп.up.railway.app` (публичный URL Railway) |
| `WEBHOOK_URL` | `https://твой-апп.up.railway.app` (тот же) |
| `USE_POLLING` | `0` (выключить polling, использовать webhook) |

Railway автоматически пересоберёт и задеплоит.

### Шаг 6. Настроить Telegram webhook

После успешного деплоя (статус `Active`), выполни локально:

```bash
WEBHOOK_URL=https://твой-апп.up.railway.app bun run bot:webhook:set
```

Или вручную через curl:
```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://твой-апп.up.railway.app/api/telegram/webhook"}'
```

Проверь что webhook работает:
```bash
bun run bot:webhook:info
```

### Шаг 7. Зарегистрировать первого старшего мастера

В веб-панели Railway (или локально — но с тем же TELEGRAM_BOT_TOKEN):
- Открой `https://твой-апп.up.railway.app`
- Войди по PIN `1111` (Тимур, старший) — это дефолтный мастер из seed

Или в Telegram:
- Найди своего бота, отправь `/start`
- Отправь `/claim 1111` — станешь Тимуром (старший)
- Теперь можешь `/register` новых мастеров: `/register Айрат REGULAR 123456789`

---

## Управление webhook

```bash
bun run bot:webhook:set      # установить webhook (нужен WEBHOOK_URL)
bun run bot:webhook:info     # проверить статус
bun run bot:webhook:delete   # удалить webhook (переключить на polling)
```

---

## Переключение БД

```bash
bun run db:use-postgres      # SQLite → PostgreSQL (для деплоя)
bun run db:use-sqlite        # PostgreSQL → SQLite (для локалки, из git)
```

---

## Архитектура доступа в Telegram

```
Пользователь пишет боту
        │
        ▼
   Telegram → POST /api/telegram/webhook (Railway публичный URL)
        │
        ▼
   Telegraf middleware: ищет Master по telegramId
        │
        ├── НЕ найден → "🔒 Доступ запрещён. Ваш ID: XXX. Используйте /claim PIN"
        │
        └── Найден → определяет роль (SENIOR/REGULAR)
                │
                ├── SENIOR: полный доступ + /register, /masters
                └── REGULAR: своя смена, заявки, хотелки, AI-чат
```

**Первый вход**: мастер знает PIN (из веб-панели от старшего), отправляет `/claim ПИН` — бот привязывает Telegram к записи мастера.

---

## Структура проекта

```
.
├── prisma/
│   ├── schema.prisma            # SQLite (локалка)
│   ├── schema.postgres.prisma   # PostgreSQL (продакшен)
│   └── seed.ts                  # демо-данные
├── src/
│   ├── app/
│   │   ├── api/                 # API routes
│   │   │   ├── auth/            # PIN-авторизация (cookie-сессия)
│   │   │   ├── bot/             # внутренние API бота (с X-Bot-Secret)
│   │   │   ├── telegram/webhook # публичный webhook endpoint
│   │   │   ├── chat, vlm, asr   # AI-эндпоинты (для веб-панели)
│   │   │   ├── shifts, wishes,  # бизнес-API
│   │   │   ├── requests, ...
│   │   ├── components/hookah/    # UI-компоненты
│   │   └── page.tsx             # auth-gate: Login / MasterView / SeniorView
│   └── lib/
│       ├── ai.ts                # AI-движок (LLM + VLM + ASR)
│       ├── auth.ts               # cookie-сессия для веб
│       ├── bot-auth.ts           # X-Bot-Secret для внутренних вызовов
│       └── bot-runner.ts         # Telegraf бот (webhook + polling)
├── scripts/
│   ├── set-webhook.ts           # установить webhook
│   ├── webhook-info.ts          # проверить статус
│   └── delete-webhook.ts        # удалить webhook
├── Dockerfile                   # для деплоя
├── railway.toml                 # конфиг Railway
├── render.yaml                  # альтернатива: Render
└── .env.example                 # пример конфигурации
```

---

## Безопасность

- `.env` в `.gitignore` — токены не попадут в git
- Доступ в Telegram — только по whitelist (telegramId)
- Внутренние API `/api/bot/*` защищены `X-Bot-Secret`
- Веб-панель — по PIN-коду (cookie-сессия)
- Управлять мастерами может только SENIOR (через веб-таб «Мастера» или `/register`)

**Важно**: если токен утёк — перевыпусти у @BotFather (`/revoke`), обнови `TELEGRAM_BOT_TOKEN` в Railway Variables.
