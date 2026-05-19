FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/backend-api/package.json ./apps/backend-api/
RUN npm ci
COPY packages/shared-types ./packages/shared-types
COPY apps/backend-api ./apps/backend-api
RUN npm run build -w packages/shared-types && npm run build -w apps/backend-api

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/backend-api/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

CMD ["node", "dist/index.js"]
