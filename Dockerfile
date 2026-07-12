# syntax=docker/dockerfile:1.7

# Build image index resolved from the official Node registry on 2026-07-12.
ARG BUILD_IMAGE=node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5
# Signed distroless Node 24 Debian 13 runtime resolved on 2026-06-25.
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian13:nonroot@sha256:963cc560b7093af878b28cfbdaea3ec099ba445b8974e3454fe9170f532bf4be

FROM ${BUILD_IMAGE} AS dependencies
WORKDIR /app
COPY --chown=node:node . .
RUN corepack enable \
    && corepack prepare pnpm@11.1.3 --activate \
    && pnpm install --frozen-lockfile --prod --ignore-scripts

FROM ${RUNTIME_IMAGE} AS runtime
ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="IPO.ONE Public Sandbox" \
      org.opencontainers.image.description="Machine-readable credit obligation protocol public sandbox" \
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
CMD ["apps/api/src/server.js"]
