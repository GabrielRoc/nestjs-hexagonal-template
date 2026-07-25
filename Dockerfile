# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ src/

RUN npm run build

# Stage 2: Production
FROM node:24-alpine

# TODO: Add extra dependencies here if needed (e.g., LibreOffice, fonts)

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# A imagem node ja traz o usuario 'node' (uid 1000). Sem chown: nada escreve em
# /app em runtime (multer usa memoryStorage), entao dist/ fica somente-leitura
# para o processo da aplicacao.
USER node

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "--enable-source-maps", "dist/main.js"]
