# =============================================================================
# Frontend Dockerfile — Prior-Art Report Builder (Next.js 16 + pnpm)
# =============================================================================
# Node 22 LTS is required by pnpm v10+ (which this project uses locally).
# Pinning pnpm to the same version used locally prevents "latest" surprises.

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
WORKDIR /app

# Pin pnpm to the same version used locally (pnpm 10.15.1)
RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

# Copy lockfile + manifests first for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile


# =============================================================================
# Stage 2: Build the Next.js app
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.15.1 --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_API_URL is injected at build time so the browser JS bundle
# contains the correct backend URL.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build


# =============================================================================
# Stage 3: Minimal production runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Copy only the standalone output produced by Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://localhost:3000/ > /dev/null || exit 1

CMD ["node", "server.js"]
