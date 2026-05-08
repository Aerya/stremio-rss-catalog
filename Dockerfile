FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

EXPOSE 7000

VOLUME ["/data"]

CMD ["node", "src/index.js"]
