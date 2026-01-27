#!/bin/bash
# Quick deployment verification script

set -e

echo "🔍 AI Trader Deployment Verification"
echo "===================================="
echo ""

# Check if docker is running
echo "Checking Docker..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi
echo "✅ Docker is running"

# Check if docker-compose is available
echo "Checking Docker Compose..."
if ! docker-compose version > /dev/null 2>&1; then
    echo "❌ Docker Compose is not installed."
    exit 1
fi
echo "✅ Docker Compose is available"

# Check for required files
echo ""
echo "Checking required files..."

FILES_TO_CHECK=(
    "docker-compose.yml"
    "Dockerfile"
    "apps/web/Dockerfile"
    ".env.example"
    "apps/web/.env.example"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ $file not found"
        exit 1
    fi
done

echo ""
echo "Checking environment variables..."

if [ -f ".env" ]; then
    echo "✅ .env file exists"
    
    # Check for critical env vars
    if grep -q "JWT_SECRET=.*-secret-" .env || ! grep -q "JWT_SECRET=" .env; then
        echo "⚠️  WARNING: JWT_SECRET appears to be default or missing"
        echo "   Generate a secure secret: openssl rand -hex 32"
    else
        echo "✅ JWT_SECRET is set"
    fi
else
    echo "⚠️  .env file not found (using .env.example as reference)"
    echo "   For production, copy .env.example to .env and configure"
fi

echo ""
echo "🎉 All checks passed!"
echo ""
echo "Quick start commands:"
echo "  Development:  docker-compose up -d"
echo "  Production:   docker-compose -f docker-compose.prod.yml up -d"
echo "  Logs:         docker-compose logs -f"
echo "  Stop:         docker-compose down"
echo ""
echo "Access points after starting:"
echo "  Frontend: http://localhost:3001"
echo "  Backend:  http://localhost:3000"
echo "  Health:   http://localhost:3000/api/v1/health"
