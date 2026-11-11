# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_OPTIONS=--max-old-space-size=512
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build -- --sourceMap false

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 UPLOAD_DIR=/app/uploads
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle/ ./drizzle/
RUN mkdir /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]
