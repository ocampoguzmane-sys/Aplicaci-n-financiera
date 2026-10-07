# App Flutter

Cliente de la aplicación financiera para **Android, iOS y Windows** (la plataforma web existe para poder probarla en un navegador).

Muestra solo lo que el rol de cada persona puede hacer; el servidor valida igualmente cada operación. Ver [docs/roles.md](../docs/roles.md).

## Ejecutar

```bash
flutter pub get
flutter run --dart-define=API_URL=http://localhost:3000
```

- En el emulador de Android el servidor local es `http://10.0.2.2:3000`.
- La dirección también se puede cambiar en la pantalla de acceso, en *Servidor*.
- Sin `API_URL` se usa `http://localhost:3000`.

## Verificar

```bash
flutter analyze
flutter test
```

Las pruebas cubren: formato de dinero y fechas, cliente HTTP, inicio de sesión, lo que ve cada rol y el flujo de pago. Los permisos de cada rol se leen de `test/fixtures/permisos.json`, que genera el servidor (`npm run exportar-permisos` en `backend/`).

## Compilar

Ver [docs/despliegue.md](../docs/despliegue.md). Resumen:

```bash
flutter build apk --release --dart-define=API_URL=https://api.miempresa.com
flutter build windows --release --dart-define=API_URL=https://api.miempresa.com   # en Windows
flutter build ios --release --dart-define=API_URL=https://api.miempresa.com       # en macOS
```

## Estructura

```
lib/
├── main.dart, app.dart   arranque, tema y raíz (login o inicio)
├── core/                 cliente HTTP y formato de dinero y fechas
├── estado/sesion.dart    sesión, permisos, cartera y día
├── modelos/              modelos de las respuestas de la API
├── pantallas/            inicio, pagos, ventas, clientes, gastos, reportes, administración
└── widgets/              componentes compartidos
```
