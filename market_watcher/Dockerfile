FROM node:20-alpine

WORKDIR /app

# Install necessary tools
RUN apk add --no-cache bash curl

# Copy package files first (for better caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set up environment
ENV NODE_ENV=production

# Command to run the application
CMD ["npx", "ts-node", "src/marketWatcher.ts"]