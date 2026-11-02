# Multi-stage build: compile with dev dependencies, ship only the production
# node_modules, the compiled dist/ and the runtime assets (views/, public/),
# running as the unprivileged `node` user.

FROM node:22-slim AS build
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production && yarn cache clean

FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# main.ts resolves these relative to dist/ (join(__dirname, '..', 'public')).
COPY public ./public
COPY views ./views
COPY package.json ./
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
