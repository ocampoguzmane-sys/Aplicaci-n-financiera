# Arquitectura

```
┌─────────────────────────┐        HTTPS + JWT        ┌──────────────────────────────┐
│  App Flutter            │ ────────────────────────► │  API REST (Node 22 + TS)     │
│  Android · iOS · Windows│   /api/v1/...             │  permisos por rol · reglas   │
│  (y web para pruebas)   │ ◄──────────────────────── │  SQLite (archivo)            │
└─────────────────────────┘                           └──────────────────────────────┘
```

## Principios

1. **El servidor decide.** Cada operación valida el permiso del rol, la cartera y el estado del día. La app solo oculta lo que el rol no puede hacer, a partir de la lista de permisos que recibe al iniciar sesión.
2. **Una sola tabla de permisos** (`backend/src/permissions.ts`). La app no duplica la matriz: sus pruebas usan `app/test/fixtures/permisos.json`, generado desde el servidor, y una prueba del backend falla si cambian sin regenerarlo (`npm run exportar-permisos`).
3. **Dinero en pesos enteros**, sin decimales ni flotantes. Los redondeos están definidos y probados.
4. **Cada empresa y cada cartera están aisladas.** Todas las consultas filtran por empresa; el empleado solo opera sobre su cartera y los recursos de otra cartera responden «no encontrado».
5. **Todo queda auditado** (`auditoria`): inicio de sesión, ventas, pagos, ediciones, anulaciones, cambios de base, apertura y cierre del día (incluido el automático).

## Backend

| Archivo | Responsabilidad |
|---|---|
| `src/app.ts`, `src/rutas.ts` | Fastify: autenticación, validación de entrada (zod) y rutas. |
| `src/permissions.ts` | Roles y permisos. |
| `src/servicios/*.ts` | Reglas de negocio: usuarios, carteras, clientes, créditos, pagos, gastos, base, día, reportes. |
| `src/credito.ts` | Cálculo de condiciones y cronogramas (puro y probado). |
| `src/tiempo.ts` | Fechas de negocio en hora de Colombia. |
| `src/db.ts` | Esquema SQLite (`node:sqlite`) y transacciones. |
| `src/server.ts` | Arranque y planificador del cierre automático. |

### Reglas de negocio importantes

- **Crédito:** `interés = capital × tasa / 100`, `total = capital + interés`, `cuota = total / n` redondeada al peso; la última cuota absorbe la diferencia, de modo que la suma siempre es el total.
- **Cronograma:** la primera cuota es el día siguiente. `DIARIO` omite los domingos (así lo muestra el vencimiento de los créditos reales del sistema de referencia). Los periodos semanales usan el próximo día indicado; `10/15/20/30 DIAS` suman N días.
- **El día:** hay uno por cartera y fecha. Pagos, ventas, gastos, altas de clientes y ajustes de la base **solo se registran con el día abierto**. Se cierra solo a las 00:00 de Colombia: un planificador lo revisa cada 30 segundos y al arrancar el servidor, por si estuvo apagado a medianoche.
- **Modificaciones:** un pago, gasto o crédito solo se modifica el mismo día en que se registró y con el día abierto. Lo ya cerrado no cambia.
- **Pagos:** valor libre (abonos parciales) hasta el saldo. Al llegar a cero el crédito pasa a *pagado* y el cliente a *inactivo*; si se anula ese pago, vuelve a *vigente*.
- **Base:** `adiciones − retiros + recaudos − capital entregado − gastos`. El cierre de un día muestra la base con la que empezó, de modo que cada día arranca donde terminó el anterior.
- **Efectividad del recaudo:** recaudos del día frente a la suma de las cuotas que tocaba cobrar ese día (créditos con saldo al empezar el día y cobro según su periodo).

### Seguridad

- Contraseñas con `scrypt` y sal aleatoria; mínimo 8 caracteres con letras y números.
- Sesión con JWT (HS256) de 12 horas. Se vuelve a leer al usuario en **cada petición**: desactivarlo o cambiarle el rol surte efecto de inmediato.
- Bloqueo de 15 minutos tras 5 intentos fallidos; el mensaje no distingue usuario inexistente de contraseña errónea.
- El token se guarda en el almacenamiento cifrado del sistema (Keychain, Keystore, Credential Locker).
- CORS cerrado por defecto en producción; las respuestas no se guardan en caché.
- Entradas validadas con zod; consultas SQL siempre parametrizadas; claves peligrosas como `__proto__` se rechazan.

## App

| Carpeta | Contenido |
|---|---|
| `lib/estado/sesion.dart` | Sesión, permisos, cartera elegida y día. |
| `lib/core/` | Cliente HTTP y formato de dinero y fechas (hora de Colombia). |
| `lib/modelos/` | Modelos de las respuestas de la API. |
| `lib/pantallas/` | Inicio, pagos, ventas, clientes, gastos, reportes y administración. |
| `lib/widgets/` | Componentes compartidos. |

La navegación del inicio muestra solo las opciones permitidas. Las pantallas se adaptan desde un teléfono hasta una ventana de escritorio.

## Decisiones y alcance

- **SQLite** basta para una empresa de cobro en ruta (decenas de usuarios). El acceso a datos está concentrado en `servicios/` y `db.ts`, por lo que migrar a PostgreSQL es acotado si el volumen crece.
- **Las ventas no se bloquean por base insuficiente**: la base puede quedar en negativo y se muestra en rojo. Se puede exigir base suficiente con una validación en `creditos.ts`.
- **No incluido todavía** (aparece en el sistema de referencia pero no en la especificación): rastreo del agente por GPS y mapa, indicadores de mora por rangos, exportes a Excel/PDF, compartir por WhatsApp, fotos de clientes y versión en portugués.
