FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY public ./public
ARG GIT_SHA
ARG GIT_PR
RUN test -n "$GIT_SHA" && VITE_GIT_SHA="$GIT_SHA" VITE_GIT_PR="$GIT_PR" pnpm build && printf '%s\n' "$GIT_SHA" > dist/version.txt
# Precompressed copies for nginx gzip_static.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' \
      -o -name '*.svg' -o -name '*.txt' -o -name '*.xml' -o -name '*.webmanifest' \) \
      -size +1k -exec gzip -9 -k {} +

FROM nginx:stable-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
