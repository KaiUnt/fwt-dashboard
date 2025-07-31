#!/bin/bash

# Render.com build script for FWT Dashboard
# This ensures we use the production-optimized requirements

echo "🚀 Starting FWT Dashboard build for Render.com..."

# Use production requirements instead of regular requirements.txt
echo "📦 Installing production dependencies..."
pip install --no-cache-dir --upgrade pip
pip install --no-cache-dir -r requirements-production.txt

echo "✅ Build completed successfully!"