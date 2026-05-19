FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++

FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/relay-service/package.json ./apps/relay-service/
RUN npm ci
COPY packages/shared-types ./packages/shared-types
COPY apps/relay-service ./apps/relay-service
RUN npm run build -w packages/shared-types && npm run build -w apps/relay-service

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/relay-service/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV RELAY_PORT=8443

EXPOSE 8443

CMD ["node", "dist/index.js"]
