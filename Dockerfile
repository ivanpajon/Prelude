# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:26.10.0-trixie-slim@sha256:ec7758ee051e457b468b32bde57b0879010b325bb9862718e9615225ce4aaae1
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs26-debian13:nonroot@sha256:afc6657a4b662f9cb69ca892b0596e55d6ef81a10e83ee8887b13f602877df89

FROM ${NODE_IMAGE} AS base
ENV HUSKY=0 NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@12.6.0 --no-audit --no-fund
WORKDIR /app
RUN chown node:node /app
USER node

FROM base AS dependencies
ARG TARGETARCH
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY --parents --chown=node:node ./apps/*/package.json ./packages/*/package.json ./
RUN --mount=type=cache,id=prelude-pnpm-${TARGETARCH},target=/pnpm/store,uid=1000,gid=1000,sharing=locked \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

FROM dependencies AS development
COPY --chown=node:node . .
ENV NODE_ENV=development
CMD ["node", "scripts/dev-web.mjs", "--container"]

FROM dependencies AS build
ARG TARGETARCH
COPY --chown=node:node . .
ENV NEXT_OUTPUT_STANDALONE=true
RUN mkdir -p apps/web/.next/cache
# Cache only intermediates: standalone/static/public must remain in the image layer.
RUN --mount=type=cache,id=prelude-next-${TARGETARCH},target=/app/apps/web/.next/cache,uid=1000,gid=1000,sharing=locked \
    pnpm --dir apps/web build

FROM build AS runtime-artifacts
# Serwist runs after Next.js: copy public only after the complete build finishes.
RUN mkdir -p /app/runtime/apps/web/.next/cache \
    && cp -a apps/web/.next/standalone/. /app/runtime/ \
    && cp -a apps/web/.next/static /app/runtime/apps/web/.next/static \
    && cp -a apps/web/public /app/runtime/apps/web/public

# Measurement baseline only; both runtimes receive precisely the same artifacts.
FROM ${NODE_IMAGE} AS production-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=runtime-artifacts --chown=65532:65532 /app/runtime/ ./
USER 65532:65532
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/node"]
CMD ["apps/web/server.js"]

FROM ${RUNTIME_IMAGE} AS production
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=runtime-artifacts --chown=65532:65532 /app/runtime/ ./
EXPOSE 3000
CMD ["apps/web/server.js"]
