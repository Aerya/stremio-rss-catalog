FROM node:22.22.3-alpine3.23

WORKDIR /app

RUN apk add --no-cache python3 make g++ vips-dev

COPY package*.json ./

RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

EXPOSE 7000

VOLUME ["/data"]

CMD ["node", "src/index.js"]
