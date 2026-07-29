# syntax=docker/dockerfile:1.7

# Build image index resolved from the official Node registry on 2026-07-27.
ARG BUILD_IMAGE=node:26.5.0-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb
# Signed distroless Node 26 Debian 13 runtime resolved on 2026-07-27.
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs26-debian13:nonroot@sha256:d440510c9ef4ff874b240bb6b855e4de4e797db283e41d8d506da5085a677f26

FROM ${BUILD_IMAGE} AS dependencies
WORKDIR /app
COPY --chown=node:node . .
RUN npm install --global pnpm@11.1.3 --ignore-scripts \
    && pnpm install --frozen-lockfile --prod --ignore-scripts \
    && npm cache clean --force

FROM ${RUNTIME_IMAGE} AS runtime
ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="IPO.ONE Closed No-Funds Pilot" \
      org.opencontainers.image.description="Durable Human and Agent credit obligation protocol runtime" \
      org.opencontainers.image.source="https://github.com/CPTM511/IPO.ONE" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080
WORKDIR /app
COPY --from=dependencies --chown=65532:65532 /app /app

USER 65532:65532
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/livez').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]
ENTRYPOINT ["/nodejs/bin/node"]
CMD ["apps/private-pilot/src/start-production.js"]
