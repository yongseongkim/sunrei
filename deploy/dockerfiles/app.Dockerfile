FROM node:22-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ && \
    npm install -g pnpm@11

ENV NODE_OPTIONS=--max-old-space-size=4096

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=$NEXT_PUBLIC_GOOGLE_CLIENT_ID

COPY sunrei-frontend/package.json ./
COPY sunrei-frontend/pnpm-workspace.yaml ./
COPY sunrei-frontend/pnpm-lock.yaml ./

COPY sunrei-frontend/packages/sunrei-admin/package.json ./packages/sunrei-admin/
COPY sunrei-frontend/packages/sunrei-app/package.json ./packages/sunrei-app/

RUN pnpm install --frozen-lockfile

COPY sunrei-frontend/packages/sunrei-app/ ./packages/sunrei-app/

RUN pnpm --filter sunrei-app build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/sunrei-app/.next/standalone ./
COPY --from=builder /app/packages/sunrei-app/.next/static ./packages/sunrei-app/.next/static
COPY --from=builder /app/packages/sunrei-app/public ./packages/sunrei-app/public

RUN addgroup -g 1001 nodejs && \
    adduser -u 1001 -G nodejs -s /bin/sh -D nextjs && \
    chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3101
ENV PORT=3101

CMD ["node", "packages/sunrei-app/server.js"]
