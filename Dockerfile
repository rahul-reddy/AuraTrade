# AuraTrade web image: Next.js standalone server. Built by
# .github/workflows/delivery.yml after CI passes on main, and on the hosted
# server by deploy/server-deploy.sh. The final stage (the default target) is
# the web server; it does not run migrations. The `migrate` stage does, and
# also carries deploy/set-user.mjs; see docs/DEPLOYMENT.md.
FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# One-off tasks against the database: `prisma migrate deploy` (the default) and
# deploy/set-user.mjs. Has the Prisma CLI and full node_modules, unlike the
# standalone web image.
FROM build AS migrate
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat \
  && addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production \
  NEXT_TELEMETRY_DISABLED=1 \
  PORT=3000 \
  HOSTNAME=0.0.0.0
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
CMD ["node", "server.js"]
