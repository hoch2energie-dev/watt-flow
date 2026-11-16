FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini gosu \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PORT=3000
ENV TZ=Europe/Berlin
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build \
  && chmod +x docker/entrypoint.sh \
  && chown -R node:node /app
ENV NODE_ENV=production

EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker/entrypoint.sh"]
