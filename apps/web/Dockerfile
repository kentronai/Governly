# Multi-stage Dockerfile for Next.js app
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* pnpm-lock.yaml* ./

# NOTE: the committed package-lock.json was generated on macOS, so `npm ci`
# installs the darwin lightningcss/@tailwindcss/oxide binaries but NOT the
# linux musl ones this Alpine image needs (npm/cli#4828) → the Next build
# fails with "Cannot find module '../lightningcss.linux-<arch>-musl.node'".
# After the deterministic `npm ci`, explicitly fetch the musl native binaries
# for the container's CPU (x64 or arm64) at the exact versions npm just
# installed (derived, so this survives bumps).
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  elif [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
    LCV=$(node -p "require('./node_modules/lightningcss/package.json').version"); \
    TWV=$(node -p "require('./node_modules/@tailwindcss/oxide/package.json').version"); \
    npm install --no-save --no-audit --no-fund \
      "lightningcss-linux-$(node -p process.arch)-musl@${LCV}" \
      "@tailwindcss/oxide-linux-$(node -p process.arch)-musl@${TWV}"; \
  else \
    npm install; \
  fi

# Stage 2: Builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Clerk keys and backend URL needed for build (will be overridden at runtime)
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG CLERK_SECRET_KEY
ARG DATABASE_URL
ARG NEXT_PUBLIC_PLAYGROUND_REQUEST_URL
# Optional: only set when the ControlNet gateway is on a different host than
# the dashboard. Unset, snippets use the origin the user is browsing.
ARG NEXT_PUBLIC_CONTROLNET_GATEWAY_URL
ARG NEXT_PUBLIC_BACKEND_URL
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_STATIC_FILES_BUCKET
ARG NEXT_PUBLIC_STATIC_FILES_REGION
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_TENANT_NAME
ARG NEXT_PUBLIC_TENANT_NAME_AI
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_BASE_URL_AI
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_NANGO_API_URL
ARG NEXT_PUBLIC_NANGO_CONNECT_URL
ARG NEXT_PUBLIC_NANGO_FRONTEND_URL
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV CLERK_SECRET_KEY=$CLERK_SECRET_KEY
ENV DATABASE_URL=$DATABASE_URL
ENV NEXT_PUBLIC_PLAYGROUND_REQUEST_URL=$NEXT_PUBLIC_PLAYGROUND_REQUEST_URL
ENV NEXT_PUBLIC_CONTROLNET_GATEWAY_URL=$NEXT_PUBLIC_CONTROLNET_GATEWAY_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_STATIC_FILES_BUCKET=$NEXT_PUBLIC_STATIC_FILES_BUCKET
ENV NEXT_PUBLIC_STATIC_FILES_REGION=$NEXT_PUBLIC_STATIC_FILES_REGION
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_ROOT_DOMAIN=$NEXT_PUBLIC_ROOT_DOMAIN
ENV NEXT_PUBLIC_TENANT_NAME=$NEXT_PUBLIC_TENANT_NAME
ENV NEXT_PUBLIC_TENANT_NAME_AI=$NEXT_PUBLIC_TENANT_NAME_AI
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BASE_URL_AI=$NEXT_PUBLIC_BASE_URL_AI
ENV NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY
ENV NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_NANGO_API_URL=$NEXT_PUBLIC_NANGO_API_URL
ENV NEXT_PUBLIC_NANGO_CONNECT_URL=$NEXT_PUBLIC_NANGO_CONNECT_URL
ENV NEXT_PUBLIC_NANGO_FRONTEND_URL=$NEXT_PUBLIC_NANGO_FRONTEND_URL
ENV NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=$NEXT_SERVER_ACTIONS_ENCRYPTION_KEY

# Build Next.js application
RUN \
  if [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm run build; \
  else \
    npm run build; \
  fi

# Stage 3: Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV PORT 8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]
