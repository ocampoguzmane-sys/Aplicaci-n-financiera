# syntax=docker/dockerfile:1
#
# Una sola imagen con la web y el servidor, para publicar en cualquier alojamiento que ejecute contenedores.
#   docker build -t financiera .
#   docker run -p 3000:3000 -v financiera-datos:/data \
#     -e JWT_SECRET=... -e ADMIN_CODIGO=1001 -e ADMIN_EMPRESA="Mi Empresa" \
#     -e ADMIN_USUARIO=admin -e ADMIN_NOMBRE="Nombre Apellido" -e ADMIN_CLAVE=... financiera
# Ver docs/web.md.

ARG FLUTTER_VERSION=3.47.6

# ---------------------------------------------------------------- 1) Compilar la web (Flutter)
FROM debian:bookworm-slim AS web-compilada
ARG FLUTTER_VERSION
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils zip \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" | tar -xJ -C /opt
ENV PATH=/opt/flutter/bin:$PATH CI=true FLUTTER_SUPPRESS_ANALYTICS=true
RUN flutter config --no-analytics >/dev/null 2>&1 && flutter precache --web
WORKDIR /src/app
COPY app/pubspec.yaml app/pubspec.lock ./
RUN flutter pub get
COPY app/ ./
# Sin API_URL: en la web la app usa la dirección desde la que se abre.
RUN flutter build web --release --no-web-resources-cdn

# ---------------------------------------------------------------- 2) Dependencias del servidor
FROM node:22-slim AS servidor-dependencias
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# La web compilada queda sola en una etapa llamada `web`. Para probar la imagen final sin recompilar:
#   docker build --build-context web=app/build/web -t financiera .
FROM scratch AS web
COPY --from=web-compilada /src/app/build/web /

# ---------------------------------------------------------------- 3) Imagen final
FROM node:22-slim
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DB_PATH=/data/financiera.db \
    WEB_DIR=/app/web
WORKDIR /app
COPY --from=servidor-dependencias /app/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/src ./src
COPY --from=web / ./web
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "--disable-warning=ExperimentalWarning", "src/server.ts"]
