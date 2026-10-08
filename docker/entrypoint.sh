#!/bin/sh
# Arranque del contenedor.
# Los discos persistentes de algunos alojamientos se montan con dueño root; se deja la carpeta de la base
# de datos a nombre del usuario de la aplicación y se baja de privilegios antes de arrancar el servidor.
set -e

if [ "$(id -u)" = "0" ]; then
  USUARIO="${APP_USER:-node}"
  DIR_DATOS="$(dirname "${DB_PATH:-/data/financiera.db}")"
  if [ "$DIR_DATOS" != "/" ]; then
    mkdir -p "$DIR_DATOS"
    chown -R "$USUARIO:$USUARIO" "$DIR_DATOS"
  fi
  exec setpriv --reuid="$USUARIO" --regid="$USUARIO" --init-groups "$@"
fi

exec "$@"
