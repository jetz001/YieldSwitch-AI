#!/bin/bash

# YieldSwitch AI - VPS Deployment Script (Ubuntu/Linux)

APP_DIR="/var/www/yieldswitch-ai"
GIT_REPO="your-repo-url"

echo "🚀 Starting Deployment..."

cd $APP_DIR || exit
git pull origin main

echo "📦 Installing Dependencies..."
npm install --production

echo "🔄 Running Database Migrations..."
npx prisma migrate deploy
npx prisma generate

echo "🏗 Building Application..."
npm run build

echo "♻️ Restarting Process..."
pm2 restart yieldswitch-ai || pm2 start ecosystem.config.js

echo "✅ Deployment Successful!"
