FROM node:22-alpine AS build
# The classic builder leaves a failed step's container and layers behind;
# the deploy script prunes them by this label.
LABEL com.twiling.app=piano-trainer

WORKDIR /app
ENV NODE_USE_ENV_PROXY=1
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY index.html vite.config.ts tsconfig.json ./
COPY src ./src
COPY tools/hand-rig/poses/studio-rest.json ./tools/hand-rig/poses/
COPY tools/hand-rig/poses/library/seven-nation-army.json ./tools/hand-rig/poses/library/
COPY public ./public
# Optional server-managed additions are loaded before the versioned scores.
RUN if [ -d public/production-lessons ]; then mv public/production-lessons ./local-lessons; fi
# Docker merges directories and overwrites matching files with the versioned copy.
COPY local-lessons ./local-lessons
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
