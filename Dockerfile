# ---- Build stage ----
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /app

# The image contains ONLY the app (shared/server/web). The marketing site
# (site/) is a separate, optional deployment — its package.json is copied just
# so the workspace lockfile validates, but its dependencies are never installed.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
COPY site/package.json site/
RUN pnpm install --frozen-lockfile --filter '!@nemomemo/site'

COPY shared/ shared/
COPY server/ server/
COPY web/ web/
RUN pnpm --filter @nemomemo/web build && pnpm --filter @nemomemo/server build
RUN pnpm --filter @nemomemo/server deploy --prod --legacy /deploy

# ---- Runtime stage ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    NEMOMEMO_PORT=5230 \
    NEMOMEMO_DATA=/app/data \
    NEMOMEMO_WEB_DIST=/app/web-dist

COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/dist ./dist
COPY --from=build /app/web/dist ./web-dist

VOLUME /app/data
EXPOSE 5230
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:5230/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
