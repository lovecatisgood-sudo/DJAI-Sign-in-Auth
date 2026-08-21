FROM node:24.18.0-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json eslint.config.js ./
COPY src ./src
COPY scripts ./scripts
COPY certs ./certs
COPY migrations ./migrations
COPY runtime ./runtime
COPY secrets ./secrets
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 djai && useradd --system --uid 10001 --gid djai --home-dir /nonexistent djai
COPY --from=build --chown=djai:djai /app/package.json /app/package-lock.json ./
COPY --from=build --chown=djai:djai /app/node_modules ./node_modules
COPY --from=build --chown=djai:djai /app/dist ./dist
USER djai
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
