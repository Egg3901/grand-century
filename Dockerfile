# Grand Century multiplayer backend (grand-century-server) for Railway.
# The web frontend is built+served separately on Cloudflare Pages; this image
# only runs the authoritative ws session server (server/index.ts via tsx).
FROM node:22-slim
WORKDIR /app

# tsx is a devDependency and is required at runtime, so install the full tree
# (npm ci keeps devDeps here because NODE_ENV is unset in this base image).
COPY package.json package-lock.json ./
RUN npm ci

# The server transpiles TS on the fly and imports shared sim code from src/,
# so the whole repo is needed at runtime.
COPY . .

# Bind all interfaces for Railway ingress; PORT is injected by Railway.
ENV HOST=0.0.0.0
EXPOSE 3412
CMD ["npm", "run", "server"]
