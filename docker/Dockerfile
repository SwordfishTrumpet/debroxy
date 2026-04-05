# Build stage
FROM node:20-alpine AS builder

# Install build dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source
COPY . .

# Production stage
FROM node:20-alpine

# Set production environment
ENV NODE_ENV=production

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache curl

# Create non-root user
RUN addgroup -g 1001 -S rdproxy && \
    adduser -u 1001 -S rdproxy -G rdproxy

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    apk del .build-deps

# Copy source from builder
COPY --from=builder /app/src ./src

# Create data directory
RUN mkdir -p /app/data && chown -R rdproxy:rdproxy /app

# Switch to non-root user
USER rdproxy

# Expose port
EXPOSE 8888

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8888/health || exit 1

# Volume for SQLite persistence
VOLUME ["/app/data"]

# Start server
CMD ["node", "src/server.js"]
