FROM node:22.23.2-alpine3.23

WORKDIR /app

RUN apk add --no-cache python3 py3-pip make g++

COPY package*.json ./
COPY requirements.txt ./

RUN npm install --omit=dev
RUN python3 -m pip install --no-cache-dir --break-system-packages -r requirements.txt

COPY . .

RUN mkdir -p /data

EXPOSE 7000

VOLUME ["/data"]

CMD ["node", "src/index.js"]
