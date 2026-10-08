# Puesta en marcha

> **¿Solo quieres un enlace web?** Sigue [web.md](web.md): publica la web y el servidor juntos con pocos clics. Esta guía es la versión técnica (servidor propio y apps nativas).

## 1. Servidor (backend)

Requisitos: Node.js 22.18 o superior.

```bash
cd backend
npm ci --omit=dev

export NODE_ENV=production
export JWT_SECRET="$(openssl rand -base64 48)"   # guárdalo: si cambia, se cierran todas las sesiones
export DB_PATH=/var/lib/financiera/financiera.db  # carpeta con permisos solo para el servicio

# Una sola vez: empresa, cartera y primer administrador. La contraseña se muestra una única vez.
npm run crear-admin -- --codigo 1001 --empresa "Mi Empresa" --cartera "Ruta 1" --usuario admin --nombre "Nombre Apellido"

npm start
```

En producción el servidor **se niega a arrancar sin `JWT_SECRET`** y no habilita CORS salvo que definas `CORS_ORIGINS`.

### HTTPS

La app solo debe hablar con el servidor por **HTTPS**: Android (producción) e iOS bloquean `http://`. Pon un proxy inverso delante, por ejemplo Caddy:

```
api.miempresa.com {
    reverse_proxy 127.0.0.1:3000
}
```

Con `NODE_ENV=production` el servidor confía en las cabeceras `X-Forwarded-*` del proxy.

### Copias de seguridad

La base es un solo archivo. Haz copias con el servidor encendido:

```bash
npm run respaldo -- /ruta/copias/financiera-$(date +%F).db
```

El comando no sobrescribe copias existentes. Programa una copia diaria (cron o temporizador de systemd) y guárdala fuera del servidor. Prueba restaurar de vez en cuando.

### Operación

- Un reinicio no pierde datos; los días abiertos que hayan pasado la medianoche de Colombia se cierran al arrancar.
- Revisa la tabla `auditoria` ante cualquier duda sobre quién hizo qué.
- Para dar de baja a una persona, desactívala desde *Usuarios*: pierde el acceso en su siguiente petición.

## 2. Apps

La dirección del servidor se fija al compilar con `API_URL`; también se puede cambiar en la pantalla de acceso, en *Servidor*.

```bash
cd app
flutter pub get
flutter build apk --release --dart-define=API_URL=https://api.miempresa.com        # Android
flutter build appbundle --release --dart-define=API_URL=https://api.miempresa.com  # Google Play
flutter build windows --release --dart-define=API_URL=https://api.miempresa.com    # Windows (desde Windows)
flutter build ios --release --dart-define=API_URL=https://api.miempresa.com        # iOS (desde macOS)
```

En el emulador de Android, el equipo anfitrión es `http://10.0.2.2:3000` (las versiones de depuración permiten `http://`).

### CI

`.github/workflows/ci.yml` prueba el backend y la app, y compila Android, Windows e iOS en cada cambio. Guarda `API_URL` como variable del repositorio (*Settings → Secrets and variables → Actions → Variables*). Los binarios quedan como artefactos de cada ejecución.

### Android: firma para Google Play

1. Crea una clave (una sola vez; **guárdala y respáldala**, sin ella no podrás actualizar la app):
   ```bash
   keytool -genkey -v -keystore upload-keystore.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
   ```
2. Local: crea `app/android/key.properties` (ya está en `.gitignore`):
   ```
   storeFile=/ruta/upload-keystore.jks
   storePassword=…
   keyAlias=upload
   keyPassword=…
   ```
3. En el CI: define los secretos `ANDROID_KEYSTORE_BASE64` (`base64 -w0 upload-keystore.jks`), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.

Sin `key.properties` se firma con la clave de depuración: sirve para probar, no para publicar.

### iOS

El CI compila **sin firmar**. Para instalar en dispositivos o publicar en la App Store se necesita una cuenta de Apple Developer: abre `app/ios/Runner.xcworkspace` en Xcode, elige tu equipo en *Signing & Capabilities* y cambia el identificador `co.financiera.financieraApp` por el tuyo. Un `http://` hacia internet no funciona en iOS; usa HTTPS.

### Windows

`flutter build windows` genera la carpeta `build/windows/x64/runner/Release/`. Se distribuye comprimida o con un instalador (por ejemplo MSIX con el paquete `msix`). Si el equipo no tiene el runtime de Visual C++, instálalo desde Microsoft.

### Identificador y nombre

El identificador de la app es `co.financiera.financiera_app`. Cámbialo antes de publicar (Android: `app/android/app/build.gradle.kts`; iOS: Xcode). El nombre visible es «Financiera»; el ícono es el predeterminado de Flutter y conviene reemplazarlo por el de tu marca.
