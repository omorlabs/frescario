ARG BUILD_FROM=node:22-alpine
FROM ${BUILD_FROM}

ENV NODE_ENV=production
WORKDIR /app

COPY app/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY app/ ./

EXPOSE 8099
CMD ["node", "server.js"]
