FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
COPY src ./src
RUN npm install && npm run build && npm prune --omit=dev
CMD ["node", "dist/index.js"]
