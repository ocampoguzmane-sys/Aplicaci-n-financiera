# Aplicación financiera

Gestión de **créditos por cuotas con cobro en ruta**: clientes, ventas a crédito, pagos, gastos, base de dinero y cierre diario, con tres roles (administrador, supervisor y empleado). Cliente móvil y de escritorio para **Android, iOS y Windows**.

Basada en el análisis del sistema de referencia (ver [docs/radiografia.md](docs/radiografia.md)).

| Carpeta | Contenido |
|---|---|
| [`backend/`](backend) | API REST (Node.js 22 + TypeScript + SQLite). Autenticación, permisos por rol, reglas de negocio y pruebas. |
| `app/` | Aplicación Flutter para Android, iOS y Windows. |
| [`docs/`](docs) | Radiografía del sistema de referencia y especificación de roles. |

## Roles

| Rol | Resumen |
|---|---|
| **Administrador** | Todos los módulos con edición; crea usuarios con rol; abre y cierra el día; adiciona y retira dinero de la base. |
| **Supervisor** | Ve la información de clientes; solo edita pagos; abre y cierra el día. |
| **Empleado** | Crea clientes nuevos, ve la información, adiciona gastos y pagos. |

Detalle, matriz de permisos y suposiciones en [docs/roles.md](docs/roles.md). **Los permisos se validan siempre en el servidor.**

El día de cada cartera **se cierra automáticamente a las 00:00 hora de Colombia**.

## Backend

Requisitos: Node.js 22.18 o superior.

```bash
cd backend
npm install
npm test            # pruebas (lógica, roles de punta a punta, cierre a medianoche, aislamiento entre empresas)
npm run typecheck

# Primer arranque: crea la empresa, su cartera y el primer administrador.
# La contraseña se toma de ADMIN_CLAVE; si no existe, se genera una y se muestra una sola vez.
npm run crear-admin -- --codigo 1001 --empresa "Mi Empresa" --cartera "Ruta 1" --usuario admin --nombre "Nombre Apellido"

JWT_SECRET="$(openssl rand -base64 48)" npm start
```

Variables de entorno:

| Variable | Descripción | Por defecto |
|---|---|---|
| `JWT_SECRET` | Secreto para firmar sesiones (≥ 32 caracteres). **Obligatorio en producción.** | aleatorio temporal en desarrollo |
| `DB_PATH` | Archivo SQLite. | `./data/financiera.db` |
| `PORT` / `HOST` | Dónde escucha. | `3000` / `0.0.0.0` |
| `CORS_ORIGINS` | Orígenes permitidos, separados por coma (para la versión web). | todos en desarrollo, ninguno en producción |
| `JWT_HORAS` | Duración de la sesión. | `12` |
| `NODE_ENV` | `production` activa las exigencias de producción. | |

La API está documentada por sus rutas en `backend/src/rutas.ts` (prefijo `/api/v1`). En las peticiones de administrador y supervisor, la cartera se elige con la cabecera `X-Cartera-Id`.
