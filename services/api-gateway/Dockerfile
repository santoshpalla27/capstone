FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
RUN chown -R nodejs:nodejs /app
USER nodejs
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8000/health || exit 1
CMD ["node", "src/server.js"]
