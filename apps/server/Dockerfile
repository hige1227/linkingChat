# Multi-stage build for LinkChat Server
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ws-protocol/package.json packages/ws-protocol/

# Install ALL dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/server/ apps/server/

# Generate Prisma client + build
RUN cd apps/server && npx prisma generate
RUN pnpm --filter @linkingchat/shared build
RUN pnpm --filter @linkingchat/ws-protocol build
RUN pnpm --filter @linkingchat/server build

# Save Prisma generated client + schema + engine to a known location
RUN PRISMA_CLIENT_DIR=$(find /app/node_modules/.pnpm -path "*/.prisma/client" -type d | head -1) && \
    cp -r "$PRISMA_CLIENT_DIR" /app/prisma-client-save && \
    cp /app/apps/server/prisma/schema.prisma /app/prisma-client-save/

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
RUN apk add --no-cache openssl

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ws-protocol/package.json packages/ws-protocol/

# Install production dependencies
RUN corepack enable && pnpm install --prod --frozen-lockfile

# Copy generated Prisma client + schema to where @prisma/client expects it
COPY --from=builder /app/prisma-client-save ./node_modules/.prisma/client
# Also copy to pnpm store location (required by Prisma 6 thin client for enums)
RUN PRISMA_STORE=$(find /app/node_modules/.pnpm -path "*/@prisma+client*/node_modules/.prisma/client" -type d | head -1) && \
    cp -r /app/node_modules/.prisma/client/* "$PRISMA_STORE/"

# Copy built output
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/ws-protocol/dist ./packages/ws-protocol/dist

EXPOSE 3008
WORKDIR /app/apps/server
CMD ["node", "dist/src/main.js"]
