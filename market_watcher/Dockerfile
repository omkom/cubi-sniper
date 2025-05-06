FROM node:20-alpine

WORKDIR /app

# Install necessary tools and dependencies
RUN apk add --no-cache bash curl

# Create directory structure
RUN mkdir -p logs

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Environment variables
ENV NODE_ENV=production
ENV DEBUG_MODE=true
ENV JUPITER_API_URL=https://quote-api.jup.ag/v6
ENV SEED_INTERVAL=15000

# Health checks
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Command to run
CMD ["npx", "ts-node", "src/marketWatcher.ts"]