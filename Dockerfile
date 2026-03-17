# ---------------------------------------------------------------------------
# Immutable image versioning (#109)
# Build args are injected by CI to produce deterministic, traceable images.
# ---------------------------------------------------------------------------
ARG GIT_SHA=unknown
ARG GIT_BRANCH=unknown
ARG BUILD_VERSION=0.0.0
ARG CI_RUN_ID=local

FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY services/api/package.json ./services/api/package.json
COPY services/indexer/package.json ./services/indexer/package.json
COPY services/moderation-worker/package.json ./services/moderation-worker/package.json
COPY packages/at-lexicons/package.json ./packages/at-lexicons/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN npm install --no-audit --no-fund

FROM deps AS source

WORKDIR /app
COPY . .

FROM source AS api-runtime

ARG GIT_SHA
ARG GIT_BRANCH
ARG BUILD_VERSION
ARG CI_RUN_ID
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.ref.name="${GIT_BRANCH}" \
      com.patchwork.ci.run-id="${CI_RUN_ID}" \
      com.patchwork.service="api"
ENV NODE_ENV=production
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@patchwork/api"]

FROM source AS indexer-runtime

ARG GIT_SHA
ARG GIT_BRANCH
ARG BUILD_VERSION
ARG CI_RUN_ID
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.ref.name="${GIT_BRANCH}" \
      com.patchwork.ci.run-id="${CI_RUN_ID}" \
      com.patchwork.service="indexer"
ENV NODE_ENV=production
EXPOSE 4100
CMD ["npm", "run", "start", "-w", "@patchwork/indexer"]

FROM source AS moderation-runtime

ARG GIT_SHA
ARG GIT_BRANCH
ARG BUILD_VERSION
ARG CI_RUN_ID
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.ref.name="${GIT_BRANCH}" \
      com.patchwork.ci.run-id="${CI_RUN_ID}" \
      com.patchwork.service="moderation-worker"
ENV NODE_ENV=production
EXPOSE 4200
CMD ["npm", "run", "start", "-w", "@patchwork/moderation-worker"]

FROM source AS web-build

ARG VITE_APP_NAME=Patchwork
ARG VITE_API_BASE_URL=https://patchwork.subcult.tv/api
ENV VITE_APP_NAME=${VITE_APP_NAME}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build -w @patchwork/web

FROM nginx:1.27-alpine AS web-runtime

ARG GIT_SHA
ARG GIT_BRANCH
ARG BUILD_VERSION
ARG CI_RUN_ID
LABEL org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.ref.name="${GIT_BRANCH}" \
      com.patchwork.ci.run-id="${CI_RUN_ID}" \
      com.patchwork.service="web"

COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
COPY ./docker/nginx/patchwork-web.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
