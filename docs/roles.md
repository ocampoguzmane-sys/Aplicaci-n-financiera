# Roles y permisos

La aplicación tiene tres roles. Los permisos se validan **siempre en el servidor**; la app solo oculta o deshabilita lo que el rol no puede hacer. La fuente única de verdad es `backend/src/permissions.ts`.

## Especificación

| Rol | Puede |
|---|---|
| **Administrador** | Acceso a todos los módulos con edición completa. Crea usuarios con rol. Abre y cierra el día. Adiciona y retira dinero de la base. |
| **Supervisor** | Ve la información de clientes. **Solo edita pagos**. Abre y cierra el día. |
| **Empleado** | Crea clientes nuevos, ve la información, y adiciona gastos y pagos. |

## Matriz de permisos

✅ permitido · 👁 solo lectura · ❌ no permitido

| Módulo / acción | Administrador | Supervisor | Empleado |
|---|:-:|:-:|:-:|
| Ver clientes, créditos e informe de crédito | ✅ | 👁 | 👁 |
| Crear cliente (con su primer crédito) | ✅ | ❌ | ✅ |
| Crear referencia de un cliente | ✅ | ❌ | ✅ |
| Editar cliente / calificación / inactivar | ✅ | ❌ | ❌ |
| Enrutamiento (orden de la ruta) | ✅ | ❌ | ❌ |
| Registrar venta a un cliente existente | ✅ | ❌ | ❌ |
| Editar o anular un crédito | ✅ | ❌ | ❌ |
| **Registrar pago** | ✅ | ✅ | ✅ |
| **Editar o anular un pago** | ✅ | ✅ | ❌ |
| **Registrar gasto** | ✅ | ❌ | ✅ |
| Editar o eliminar un gasto | ✅ | ❌ | ❌ |
| Consultar gastos, transacciones, cierres y notas | ✅ | 👁 | 👁 |
| Simulador de crédito | ✅ | ✅ | ✅ |
| **Abrir y cerrar el día** | ✅ | ✅ | ❌ |
| **Adicionar y retirar dinero de la base** | ✅ | ❌ | ❌ |
| **Crear y administrar usuarios** | ✅ | ❌ | ❌ |
| Administrar carteras (rutas) | ✅ | ❌ | ❌ |

## Alcance por cartera

- El **empleado** pertenece a **una cartera** y solo ve y opera sobre ella.
- El **supervisor** y el **administrador** pueden ver todas las carteras de la empresa (o la que tengan asignada, si se les asigna una).

## El día

- Cada cartera tiene un día por fecha. Estados: **Abierto** y **Cerrado**.
- **Pagos, ventas, gastos y clientes nuevos solo se registran con el día abierto.**
- El administrador y el supervisor abren y cierran el día de la fecha actual.
- **El día se cierra automáticamente a las 00:00 hora de Colombia** (`America/Bogota`, UTC−5). Al día siguiente hay que abrirlo de nuevo.
- Los pagos de días anteriores ya cerrados no se pueden editar.

## La base

- La base es el dinero disponible de la cartera. Cambia con adiciones y retiros del administrador, con los recaudos, con las ventas (capital entregado) y con los gastos.
- El cierre muestra: base inicial, recaudos (efectivo y transferencia), ventas, gastos, adiciones, retiros y total del día.

## Reglas adicionales

- Los ajustes de la base **requieren el día abierto**, igual que pagos, ventas y gastos.
- Un pago, gasto o crédito solo se modifica **el mismo día** en que se registró.
- Una venta **no se bloquea** si la base es insuficiente: la base queda en negativo y se muestra en rojo.

## Suposiciones que conviene confirmar

La descripción original deja algunos puntos abiertos; se resolvieron así y cada uno se cambia con una línea en `permissions.ts`:

1. **"Solo edición en los pagos" del supervisor** incluye registrar pagos nuevos además de editarlos o anularlos.
2. **El empleado puede crear un cliente junto con su primer crédito** (así funciona el sistema de referencia), pero **no registrar ventas nuevas a clientes ya existentes**, porque la especificación no se lo concede.
3. **Reportes** (transacciones, cierres, gastos, notas) son de **lectura para los tres roles**.
4. **Referencias de clientes**: las puede crear el empleado, porque forman parte de dar de alta a un cliente.
5. **Reabrir un día ya cerrado** equivale a abrir el día actual de nuevo; lo pueden hacer el administrador y el supervisor.
