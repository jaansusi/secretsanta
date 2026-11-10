# Multi-stage build: compile with dev dependencies, ship only the production
# node_modules, the compiled dist/ and the runtime assets (views/, public/),
# running as the unprivileged `node` user.
#
# The base image is pinned by digest so a build is reproducible and a
# compromised or re-pushed tag cannot change what ships; Dependabot
# (.github/dependabot.yml) proposes digest bumps. Node 26 is the current
# Active LTS line.
ARG NODE_IMAGE=node:26-slim@sha256:5adad64f9a1fca2d51972caa65983634c8a774eb300d72b20f7f2a0f60368072

# Node >= 25 images no longer bundle yarn/corepack. Install the pinned yarn
# version used to write yarn.lock, in the build stages only: the runtime image
# needs neither yarn nor npm's global packages.
FROM ${NODE_IMAGE} AS yarn
RUN npm install --global --ignore-scripts yarn@1.22.22

FROM yarn AS build
WORKDIR /app
COPY package.json yarn.lock ./
# --ignore-scripts: no dependency gets to run code at install time. Nothing in
# the tree needs an install hook (prebuilt binaries ship as optional deps).
RUN yarn install --frozen-lockfile --ignore-scripts
COPY . .
RUN yarn build

FROM yarn AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Root-owned and read-only for the `node` user that runs the app.
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# main.ts resolves these relative to dist/ (join(__dirname, '..', 'public')).
COPY public ./public
COPY views ./views
# Santa's original texts, imported into the database on first start.
COPY scripts/santa-audio/*.json ./scripts/santa-audio/
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
