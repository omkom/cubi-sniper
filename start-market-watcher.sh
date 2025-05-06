#!/bin/bash
# Script to start the market watcher with AI integration

# Set default environment variables
export DEBUG_MODE=true
export REDIS_URL=redis://redis:6379
export AI_MODEL_URL=http://ai_model:8000
export JUPITER_API_URL=https://quote-api.jup.ag/v6
export MIN_LIQUIDITY=1
export SEED_INTERVAL=15000

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker and try again."
  exit 1
fi

# Check for Docker Compose
if command -v docker-compose > /dev/null 2>&1; then
  COMPOSE="docker-compose"
elif command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  COMPOSE="docker compose"
else
  echo "❌ Docker Compose not found. Please install Docker Compose and try again."
  exit 1
fi

# Check if docker-compose.marketwatcher.yml exists
if [ ! -f "docker-compose.marketwatcher.yml" ]; then
  echo "❌ docker-compose.marketwatcher.yml not found."
  exit 1
fi

# Create necessary directories
mkdir -p ai_model/models
mkdir -p ai_model/training_data
mkdir -p market_watcher/logs
mkdir -p redis

# Ensure redis.conf exists
if [ ! -f "redis/redis.conf" ]; then
  echo "Creating redis.conf..."
  cat > redis/redis.conf << 'EOL'
daemonize no
port 6379
appendonly yes
appendfilename "appendonly.aof"
appendfsync everysec
save 900 1
save 300 10
save 60 10000
rdbcompression yes
rdbchecksum yes
dbfilename dump.rdb
dir /data
loglevel notice
EOL
fi

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
$COMPOSE -f docker-compose.marketwatcher.yml down

# Start the services
echo "🚀 Starting Market Watcher with AI integration..."
$COMPOSE -f docker-compose.marketwatcher.yml up -d

# Check if services started correctly
echo "⏳ Checking service status..."
sleep 5

# Check Redis
if docker ps | grep -q "redis"; then
  echo "✅ Redis is running"
else
  echo "❌ Redis failed to start"
fi

# Check AI Model
if docker ps | grep -q "ai_model"; then
  echo "✅ AI Model is running"
else
  echo "❌ AI Model failed to start"
fi

# Check Market Watcher
if docker ps | grep -q "market_watcher"; then
  echo "✅ Market Watcher is running"
else
  echo "❌ Market Watcher failed to start"
fi

# Show logs instructions
echo ""
echo "📊 View logs with: $COMPOSE -f docker-compose.marketwatcher.yml logs -f"
echo "🔍 Access Redis data with: docker exec -it redis redis-cli"
echo ""
echo "✨ Market Watcher with AI integration is now running!"