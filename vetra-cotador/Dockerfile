FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV VETRA_DEPLOY_TARGET=node
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production VETRA_DEPLOY_TARGET=node PORT=3000 HOST=0.0.0.0
COPY --from=build --chown=node:node /app/dist/standalone/ ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
