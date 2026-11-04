# syntax=docker/dockerfile:1
#
# Risonix frontend — Node 24 (sviluppo) e build statica + Nginx (produzione).
# Target: `dev` e `prod`. Build per linux/arm64. Versioni pinnate (P0-02).

ARG NODE_IMAGE=node:24.22.2-slim
ARG NGINX_IMAGE=nginx:1.30.6-alpine

# ---------------------------------------------------------------------------
# deps — installa le dipendenze in modo deterministico (package-lock.json)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# dev — Vite dev server con hot reload (porta 5173)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS dev
WORKDIR /app
ENV NODE_ENV=development
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# build — typecheck + compilazione della SPA
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# prod — Nginx serve i file statici su :3000
# ---------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 3000
