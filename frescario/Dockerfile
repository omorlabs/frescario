# Imagen fija de Node 22 sobre Alpine (no depende de la imagen base que pase Home Assistant)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY app/ ./

EXPOSE 8099
CMD ["node", "server.js"]
