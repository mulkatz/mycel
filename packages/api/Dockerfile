# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root files
COPY package*.json tsconfig.base.json tsconfig.json ./

# Copy all package.json files for dependency resolution
COPY packages/shared/package*.json ./packages/shared/
COPY packages/schemas/package*.json ./packages/schemas/
COPY packages/ingestion/package*.json ./packages/ingestion/
COPY packages/core/package*.json ./packages/core/
COPY packages/api/package*.json ./packages/api/

RUN npm ci

# Copy source and build
COPY packages/ ./packages/
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Copy built artifacts and package files
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

COPY --from=builder /app/packages/schemas/dist ./packages/schemas/dist
COPY --from=builder /app/packages/schemas/package.json ./packages/schemas/

COPY --from=builder /app/packages/ingestion/dist ./packages/ingestion/dist
COPY --from=builder /app/packages/ingestion/package.json ./packages/ingestion/

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/

COPY --from=builder /app/packages/api/dist ./packages/api/dist
COPY --from=builder /app/packages/api/package.json ./packages/api/

EXPOSE 8080
ENV PORT=8080
CMD ["node", "packages/api/dist/index.js"]
