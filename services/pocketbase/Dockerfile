# syntax=docker/dockerfile:1.7
# Pinned PocketBase release. Checksums come from the release's checksums.txt.
FROM alpine:3.24.3

ARG PB_VERSION=0.40.6
ARG TARGETARCH

RUN apk add --no-cache \
      ca-certificates=20261020-r0 \
      tzdata=2026f-r0 \
      unzip=6.0-r16

WORKDIR /pb

RUN set -eux; \
    case "${TARGETARCH:-amd64}" in \
      amd64) pb_arch="amd64"; pb_sha="0e1f609158ed945f809f8a02ae012aa0427129c66ebb63c1aee76f2c0309373f" ;; \
      arm64) pb_arch="arm64"; pb_sha="d22c66ceb67ca92b7d767f36d826e848a276bcfa3c197ead20bf87c42208984f" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    wget -q -O /tmp/pocketbase.zip \
      "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${pb_arch}.zip"; \
    echo "${pb_sha}  /tmp/pocketbase.zip" | sha256sum -c -; \
    unzip -q /tmp/pocketbase.zip -d /pb; \
    rm -f /tmp/pocketbase.zip; \
    chmod 0755 /pb/pocketbase

COPY entrypoint.sh /usr/local/bin/pocketbase-entrypoint
COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
COPY config /pb/config

RUN chmod 0755 /usr/local/bin/pocketbase-entrypoint

ENV PB_VERSION=${PB_VERSION}

EXPOSE 8090

ENTRYPOINT ["/usr/local/bin/pocketbase-entrypoint"]
