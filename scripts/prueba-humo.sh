#!/bin/sh
# Comprueba que una publicación funciona: la web, la API y el acceso.
#
#   scripts/prueba-humo.sh https://mi-app.onrender.com CODIGO USUARIO CONTRASEÑA
#
# Termina con código 0 si todo está bien y 1 si algo falla. No modifica datos: solo lee e inicia sesión.
set -u

URL="${1:-}"; CODIGO="${2:-}"; USUARIO="${3:-}"; CLAVE="${4:-}"
if [ -z "$URL" ] || [ -z "$CODIGO" ] || [ -z "$USUARIO" ] || [ -z "$CLAVE" ]; then
  echo "Uso: $0 <dirección> <código> <usuario> <contraseña>" >&2
  exit 2
fi
URL="${URL%/}"
fallas=0
ok()  { echo "  ✔ $1"; }
mal() { echo "  ✘ $1"; fallas=$((fallas + 1)); }

estado() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$@"; }

echo "Comprobando $URL"

[ "$(estado "$URL/salud")" = "200" ] && ok "el servidor responde (/salud)" || mal "el servidor no responde en /salud"

pagina="$(curl -s --max-time 30 "$URL/")"
echo "$pagina" | grep -q '<title>Financiera</title>' && ok "la web se entrega en la dirección principal" || mal "la dirección principal no muestra la app"

curl -s --max-time 30 "$URL/manifest.json" | grep -q '"Financiera"' && ok "la app es instalable (manifiesto)" || mal "falta el manifiesto de la app"

tam="$(curl -s --max-time 60 -o /dev/null -w '%{size_download}' "$URL/main.dart.js")"
[ "${tam:-0}" -gt 100000 ] && ok "el código de la app se descarga ($tam bytes)" || mal "no se pudo descargar el código de la app"

cabeceras="$(curl -s -I --max-time 30 "$URL/")"
echo "$cabeceras" | grep -qi '^content-security-policy:' && ok "política de seguridad de contenido activa" || mal "falta la política de seguridad de contenido"
echo "$cabeceras" | grep -qi '^x-frame-options: *deny' && ok "protegida contra incrustación en otros sitios" || mal "falta X-Frame-Options"
case "$URL" in
  https://*) echo "$cabeceras" | grep -qi '^strict-transport-security:' && ok "HTTPS obligatorio (HSTS)" || mal "falta HSTS (¿el alojamiento no envía X-Forwarded-Proto?)" ;;
  *) echo "  - HTTPS no aplica a esta dirección (${URL%%:*})" ;;
esac

[ "$(estado "$URL/api/v1/clientes")" = "401" ] && ok "la API exige sesión" || mal "la API no exige sesión"

[ "$(estado -X POST -H 'content-type: application/json' -d "{\"codigo\":\"$CODIGO\",\"usuario\":\"$USUARIO\",\"contrasena\":\"incorrecta-$$\"}" "$URL/api/v1/auth/login")" = "401" ] \
  && ok "rechaza una contraseña incorrecta" || mal "no rechazó una contraseña incorrecta"

respuesta="$(curl -s --max-time 30 -X POST -H 'content-type: application/json' -d "{\"codigo\":\"$CODIGO\",\"usuario\":\"$USUARIO\",\"contrasena\":\"$CLAVE\"}" "$URL/api/v1/auth/login")"
token="$(echo "$respuesta" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
if [ -n "$token" ]; then
  ok "el acceso con las credenciales indicadas funciona"
  [ "$(estado -H "authorization: Bearer $token" "$URL/api/v1/auth/me")" = "200" ] && ok "la sesión es válida" || mal "la sesión no es válida"
else
  mal "no se pudo iniciar sesión con las credenciales indicadas"
fi

if [ "$fallas" -eq 0 ]; then echo "Todo en orden."; else echo "$fallas comprobación(es) fallaron."; fi
[ "$fallas" -eq 0 ]
