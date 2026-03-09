# Multi-stage build for LinkingChat Server
# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/ws-protocol/package.json packages/ws-protocol/

# Install dependencies
RUN corepack enable && pnpm install --frozen-lockfile

# Copy source
COPY packages/ packages/
COPY apps/server/ apps/server/

# Generate Prisma client (must be before build)
RUN cd apps/server && npx prisma generate

# Build shared packages first, then server
RUN pnpm --filter @linkingchat/shared build
RUN pnpm --filter @linkingchat/ws-protocol build
RUN pnpm --filter @linkingchat/server build

# Stage 2: Production
FROM node:22-alpine
WORKDIR /app

# Copy built output
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/prisma ./prisma

# Copy node_modules (production dependencies)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/packages ./packages

# Copy Prisma generated client (query engine)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 3008

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy --schema=./prisma/schema.prisma && node dist/main.js"]
