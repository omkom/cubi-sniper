FROM node:20-alpine

WORKDIR /app
COPY . .

RUN npm install -g ts-node typescript && npm install

CMD ["ts-node", "src/marketWatcher.ts"]
