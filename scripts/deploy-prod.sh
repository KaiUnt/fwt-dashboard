#!/bin/bash
set -e

# FWT Dashboard Production Deployment Script
echo "=========================================="
echo "Starting Production Deployment"
echo "Date: $(date)"
echo "=========================================="

PROJECT_DIR="/opt/fwt-dashboard"

# Navigate to project directory
cd "$PROJECT_DIR"

echo "Updating backend dependencies..."
source venv/bin/activate
pip install -r requirements.txt
deactivate

echo "Updating frontend dependencies..."
cd frontend

# Fix .next directory permissions if it exists
if [ -d "$PROJECT_DIR/frontend/.next" ]; then
    echo "Fixing .next directory permissions..."
    sudo /usr/bin/chown -R kai:kai "$PROJECT_DIR/frontend/.next"
fi

npm ci --production=false

echo "Building frontend..."
npm run build

echo "Restarting services..."
sudo /usr/bin/systemctl restart fwt-backend.service
sudo /usr/bin/systemctl restart fwt-frontend.service

echo "Checking service status..."
sleep 3
systemctl status fwt-backend.service --no-pager | head -n 10
systemctl status fwt-frontend.service --no-pager | head -n 10

echo "=========================================="
echo "Production Deployment Complete!"
echo "=========================================="
