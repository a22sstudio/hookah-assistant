# ─── Dockerfile для деплоя Hookah Assistant ───
# Простой одно-образный билд на Bun

FROM oven/bun:1.2
WORKDIR /app

# CACHE_BUSTER — меняется при каждом пуше, гарантирует пересборку без кеша
ARG CACHE_BUSTER=0
RUN echo "cache-bust: $CACHE_BUSTER"

# Устанавливаем OpenSSL — нужен Prisma для PostgreSQL
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Копируем исходники
COPY . .

# Автоматически переключаемся на PostgreSQL-схему для продакшена
RUN if [ -f prisma/schema.postgres.prisma ]; then cp prisma/schema.postgres.prisma prisma/schema.prisma; fi

# Генерируем Prisma клиент
RUN bun run db:generate

# Билдим Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Railway автоматически задаёт $PORT — приложение должно слушать его
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

# Печатаем версии и запускаем
CMD ["sh", "-c", "echo '=== Запуск ===' && bun --version && cat package.json | grep -A1 scripts && if [ -z \"$DATABASE_URL\" ]; then echo '⚠️ DATABASE_URL не задан'; else echo '🔄 db:push...'; timeout 30 bun run db:push || echo '⚠️ db:push не удался — стартую всё равно'; fi && PORT=${PORT:-3000} bun run start"]
