# W-API Adapter CRM Dockerfile - MTCA
# Best practices: non-root user, pinned image, healthcheck

FROM node:20-alpine@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Install dependencies as root first
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy source and set ownership
COPY src/ ./src/

# Change ownership to non-root user
RUN chown -R appuser:appgroup /app

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Expose port
EXPOSE 3002

# Run as non-root user
CMD ["node", "src/index.js"]
