# Multi-stage Docker build for FWT Dashboard
# Optimized for production deployment with security best practices

# ============================================================================
# FRONTEND BUILD STAGE
# ============================================================================
FROM node:18-alpine AS frontend-builder

# Security: Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY frontend/package*.json ./
COPY frontend/tsconfig.json ./
COPY frontend/next.config.ts ./
COPY frontend/tailwind.config.js ./
COPY frontend/postcss.config.mjs ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY frontend/src ./src
COPY frontend/public ./public

# Build application
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================================
# BACKEND BUILD STAGE
# ============================================================================
FROM python:3.11-slim AS backend-builder

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements and install Python dependencies
COPY requirements-production.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-production.txt

# ============================================================================
# PRODUCTION STAGE
# ============================================================================
FROM python:3.11-slim AS production

# Security: Install security updates only
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Security: Create non-root user
RUN groupadd -r fwtapp && useradd -r -g fwtapp fwtapp

# Set working directory
WORKDIR /app

# Copy Python dependencies from builder
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin

# Copy backend application
COPY --chown=fwtapp:fwtapp . .

# Copy built frontend
COPY --from=frontend-builder --chown=fwtapp:fwtapp /app/.next ./frontend/.next
COPY --from=frontend-builder --chown=fwtapp:fwtapp /app/public ./frontend/public
COPY --from=frontend-builder --chown=fwtapp:fwtapp /app/package*.json ./frontend/

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs && \
    chown -R fwtapp:fwtapp /app

# Security: Switch to non-root user
USER fwtapp

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
ENV NODE_ENV=production

# Expose ports
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start command
CMD ["python", "-m", "uvicorn", "backend_api:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"] 