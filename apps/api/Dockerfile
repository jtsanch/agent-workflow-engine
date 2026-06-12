FROM node:22-alpine AS base
WORKDIR /app

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json tsconfig.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/agent-sdk/package.json packages/agent-sdk/package.json
COPY packages/observability/package.json packages/observability/package.json
COPY packages/ui-schema/package.json packages/ui-schema/package.json

RUN corepack enable
RUN pnpm install --filter @personal-agent-os/api... --frozen-lockfile=false

COPY . .
RUN pnpm --filter @personal-agent-os/api build

CMD ["node", "apps/api/dist/index.js"]
