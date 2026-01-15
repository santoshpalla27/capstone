FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production PORT=3004
EXPOSE 3004
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3004/health || exit 1
CMD ["node", "server.js"]
