# Use the official Node.js image with Alpine Linux
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install -g ts-node typescript && npm install

# Copy the rest of the application code
COPY . .

# Command to run the application
CMD ["ts-node", "src/marketWatcher.ts"]
