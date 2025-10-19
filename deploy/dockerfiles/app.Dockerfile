# Dependencies stage
FROM node:22-alpine AS deps

WORKDIR /app

# Copy package files
COPY sunrei-app/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Builder stage
FROM node:22-alpine AS builder

WORKDIR /app

# Build arguments for Next.js public env vars
# These are passed from GitHub Actions using general secret names (e.g., GOOGLE_MAPS_API_KEY)
# but prefixed with NEXT_PUBLIC_ for Next.js client-side usage
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Set as environment variables for build time
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Copy package files
COPY sunrei-app/package*.json ./

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY sunrei-app/ ./

# Build the application
RUN npm run build

# Runner stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001 && \
    chown -R nextjs:nodejs /app

USER nextjs

# Expose port
EXPOSE 3101

ENV PORT=3101

# Start the application
CMD ["npm", "start"]
