# ─── Dockerfile для деплоя Hookah Assistant ───
# Поддерживает как SQLite (volume), так и PostgreSQL (через DATABASE_URL)

FROM oven/bun:1.1 AS base
WORKDIR /app

# ── 1. Установка зависимостей ──
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# ── 2. Копируем исходники ──
COPY . .

# ── 2.5. Автоматически переключаемся на PostgreSQL-схему для продакшена ──
# (prisma/schema.postgres.prisma — копия schema.prisma с provider="postgresql")
RUN if [ -f prisma/schema.postgres.prisma ]; then cp prisma/schema.postgres.prisma prisma/schema.prisma; fi

# ── 3. Генерируем Prisma клиент ──
RUN bun run db:generate

# ── 4. Билдим Next.js ──
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

# ── 5. Production образ ──
FROM oven/bun:1.1 AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Копируем только нужное для продакшена
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/package.json ./
COPY --from=base /app/bun.lock* ./
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/next.config.ts ./
COPY --from=base /app/tsconfig.json ./
COPY --from=base /app/tailwind.config.ts ./
COPY --from=base /app/postcss.config.mjs ./
COPY --from=base /app/components.json ./

EXPOSE 3000

# Стартуем production-сервер
# Применяем схему к БД (db push) и стартуем
# NOTE: для персистентности БД используй Railway Volumes (UI: Settings → Volumes),
# не VOLUME инструкцию в Dockerfile — Railway её не поддерживает.
CMD ["sh", "-c", "bun run db:push && bun run start"]
