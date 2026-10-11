# ─── Dockerfile — полный контроль, standalone build ───

FROM oven/bun:1.2 AS base
WORKDIR /app

# OpenSSL для Prisma
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install
COPY package.json bun.lock* ./
RUN bun install

# Copy + Build
COPY . .
RUN if [ -f prisma/schema.postgres.prisma ]; then cp prisma/schema.postgres.prisma prisma/schema.prisma; fi
# generate через локальный бинарь (не bunx — он может поставить prisma@8.0.0-rc с другой семантикой)
RUN ./node_modules/.bin/prisma generate
RUN bun run build

# Copy standalone artifacts
RUN cp -r .next/static .next/standalone/.next/
RUN cp -r public .next/standalone/
RUN cp -r prisma .next/standalone/
# Копируем .z-ai-config для Z.ai SDK (LLM в боте)
RUN if [ -f .z-ai-config ]; then cp .z-ai-config .next/standalone/; fi
RUN mkdir -p .next/standalone/node_modules/@prisma && \
    cp -r node_modules/@prisma/* .next/standalone/node_modules/@prisma/
# Копируем prisma CLI (для db:push на старте)
RUN mkdir -p .next/standalone/node_modules/prisma && \
    cp -r node_modules/prisma/* .next/standalone/node_modules/prisma/
RUN mkdir -p .next/standalone/node_modules/pdf-parse && \
    cp -r node_modules/pdf-parse/* .next/standalone/node_modules/pdf-parse/
# Копируем z-ai-web-dev-sdk (для LLM в боте/чате)
RUN mkdir -p .next/standalone/node_modules/z-ai-web-dev-sdk && \
    cp -r node_modules/z-ai-web-dev-sdk/* .next/standalone/node_modules/z-ai-web-dev-sdk/

# ─── Production ───
FROM node:22-slim AS runner
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/standalone/node_modules ./node_modules
COPY --from=base /app/prisma ./prisma

# Создаём .z-ai-config из env переменной на старте (если задана)
# Если ZAI_API_KEY задан — пишем конфиг, иначе файл уже скопирован из build
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

# db:push через локальный prisma + создаём .z-ai-config из env + standalone server
CMD ["sh", "-c", "if [ -n \"$ZAI_API_KEY\" ]; then echo \"{\\\"baseUrl\\\":\\\"https://internal-api.z.ai/v1\\\",\\\"apiKey\\\":\\\"$ZAI_API_KEY\\\"}\" > .z-ai-config; fi && node node_modules/prisma/build/index.js db push --accept-data-loss --schema=prisma/schema.prisma || true && node server.js"]
