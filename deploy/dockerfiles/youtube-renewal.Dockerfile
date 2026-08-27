FROM ghcr.io/astral-sh/uv:0.11.26 AS uv

FROM node:22-bookworm-slim

ARG CODEX_VERSION=0.150.1

RUN apt-get update && \
    apt-get install --no-install-recommends -y \
      ca-certificates \
      ffmpeg \
      git \
      libgl1 \
      libglib2.0-0 \
      libgomp1 \
      python3 \
      python3-venv \
      tini && \
    npm install --global "@openai/codex@${CODEX_VERSION}" && \
    npm cache clean --force && \
    rm -rf /var/lib/apt/lists/*

COPY --from=uv /uv /uvx /usr/local/bin/

RUN groupadd --gid 10001 worker && \
    useradd --uid 10001 --gid worker --create-home worker && \
    mkdir -p /app/.claude/scripts /app/.claude/config /var/lib/sunrei && \
    chown -R worker:worker /app /var/lib/sunrei

WORKDIR /app

COPY --chown=worker:worker .claude/scripts ./.claude/scripts
COPY --chown=worker:worker .claude/config ./.claude/config

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

USER worker

ENTRYPOINT ["tini", "--"]
CMD ["/app/.claude/scripts/youtube/run_container_renewal.sh"]
