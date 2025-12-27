FROM node:20-slim

WORKDIR /app

COPY package.json ./
COPY monitor.js ./

RUN chmod +x monitor.js

CMD ["node", "monitor.js"]
