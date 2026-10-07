# Radiografía del sistema de referencia

Documento de análisis del sistema existente (RedShop, v10.1.6) sobre el que se basa esta aplicación.

## 1. Alcance y método

- Se recorrió el sistema con **dos cuentas autorizadas** (una de administrador y una de empleado), en **modo solo lectura**: se abrieron pantallas, listados y diálogos, pero no se guardó, confirmó, abrió ni cerró nada.
- Se complementó con el código público del cliente web (textos, cronograma del simulador y nombres de endpoints).
- No se incluyen en este documento datos personales de clientes, nombres reales de usuarios ni credenciales.

## 2. Hallazgos generales

| Aspecto | Observación |
|---|---|
| Tipo de sistema | Gestión de **créditos por cuotas con cobro en ruta** (microcrédito): clientes, ventas a crédito, abonos, gastos de ruta, base de dinero y cierre diario. |
| Cliente | Aplicación web de una sola página (React). Navegación interna por estado, sin rutas por módulo. |
| Autenticación | Tres campos: **Código** (empresa), **Usuario** y **Contraseña**. |
| API | Endpoints bajo `/apiv/apiv/...`; el contenido de las peticiones y respuestas viaja **cifrado** (RSA + AES). |
| Idiomas | Español y portugués. |
| Ubicación | La app pide geolocalización para "Iniciar Ruta" y el rastreo del agente. |
| Alcance de datos | Cada usuario ve **su cartera** (ruta). Las dos cuentas probadas tenían carteras distintas y listados distintos. |
| Roles | **Las dos cuentas probadas muestran el mismo menú de "Agente".** La separación en administrador, supervisor y empleado es un requisito nuevo de esta aplicación. |

## 3. Modelo de datos inferido

- **Empresa**: código y nombre.
- **Usuario**: usuario, nombre, rol, cartera asignada.
- **Cartera (ruta)**: nombre. Agrupa clientes y se cierra día a día.
- **Cliente**: identificación, nombres, apellidos, dirección, barrio, teléfono, calificación (Bueno / Regular / Malo), estado (activo / inactivo), orden en la ruta, referencias.
- **Referencia del cliente**: nombres, dirección, barrio, teléfono, información adicional (máx. 100 caracteres).
- **Crédito (venta)**: número, fecha, capital, tasa de utilidad, número de cuotas, valor de cuota, valor total, periodo, fecha de vencimiento, saldo, estado (vigente / pagado).
- **Pago (abono)**: crédito, valor, fecha y hora, forma (efectivo `EF` / transferencia `TR`), usuario, marca de modificado.
- **Gasto**: tipo, valor, detalle (máx. 100 caracteres), fecha y hora, usuario.
- **Nota**: anotación asociada a un crédito (historial de notas).
- **Día (jornada)**: estado abierto / cerrado por cartera y fecha.
- **Base (caja)**: dinero disponible de la cartera; admite adiciones de capital.
- **Registro de eventos**: inicio y fin de sesión, cobro, venta, gasto, pago, cliente nuevo.

## 4. Módulos y pantallas

### Inicio
- Accesos rápidos: **Registrar Pagos**, **Registrar Ventas**, **Iniciar Ruta**.
- Tarjetas: **Clientes** (Nuevo, Inactivos, Todos, Enrutamiento), **Gastos** (Adicionar, Consultar), **Reportes** (Transacciones, Cierres, Simulador, Historial Notas).
- **Indicadores de la ruta**: Tasa (1.20), Cuotas por defecto (20), Estado del día (Abierto / Cerrado), Geolocalización.
- Menú de usuario: idioma, información de versión, salir.

### Registrar Pagos
- Contadores: créditos vigentes y clientes activos. Buscador.
- Tarjeta por crédito vigente: nombre, valor del crédito, saldo, número de pagos, cuotas pagadas, periodo y fecha del último pago.
- **Pagar**: diálogo con datos del crédito, último pago, valor de cuota, campo **Valor** (admite abonos parciales) y dos botones de confirmación: **Transferencia** y **Efectivo**. Permite agregar una nota.
- **Ver**: *Informe de Crédito* con capital, intereses, tasa, cuotas, valor de cuota, valor total, vencimiento, periodo, saldo, total de abonos, número de pagos, cuotas pagadas (aprox.), tabla de pagos (ítem, valor, fecha, forma, saldo) e historial individual de créditos del cliente.

### Registrar Ventas
- Contadores: total de clientes y clientes activos. Buscador.
- Tarjeta por cliente: vigentes, pagados, barrio, indicador de estado (verde / rojo).
- **Vender**: diálogo con calificación, teléfono, dirección, **Valor del artículo**, **Utilidad**, **Cuotas** y **Periodo**; botón **Registrar Venta**.

### Clientes
- **Nuevo**: identificación, nombres, apellidos, dirección, barrio, teléfono y condiciones del primer crédito (valor del artículo, utilidad, cuotas, periodo). Botón **Crear Cliente**. Valida que no exista un cliente con la misma identificación en la cartera.
- **Inactivos**: clientes sin crédito vigente, con **Vender** y **Ver** (informe de su último crédito).
- **Todos**: total y activos; por cliente vigentes, pagados, total, barrio, **Datos Cliente** (identificación, teléfono, dirección, barrio, calificación) y **Crear Referencia**.
- **Enrutamiento**: orden de la ruta **Alfabético** o **Personalizado** (arrastrar o escribir la posición), con botón **Guardar**.

### Gastos
- **Adicionar**: tipo de gasto, valor y detalle (máx. 100 caracteres). Botón **Registrar Gasto**.
- **Consultar**: rango de fechas (inicial y final).

### Reportes
- **Transacciones** (por fecha): pestañas **Pagos**, **Créditos** y **Gastos**; totales por forma de pago; tabla con cliente, valor, saldo, cuota, periodo y forma; botón para compartir por WhatsApp.
- **Cierres** (por fecha): base, recaudos (efectivo y transferencia), ventas, gastos, total del día, efectividad de recaudo y utilidad diaria aproximada.
- **Simulador**: cálculo de crédito sin guardar nada (ver fórmulas).
- **Historial Notas**: listado de notas.

## 5. Reglas de negocio y fórmulas

**Crédito**

```
interés  = capital × tasa / 100
total    = capital + interés
cuota    = total / número de cuotas        (la última cuota absorbe la diferencia)
saldo    = total − suma de abonos
cuotas pagadas (aprox.) = total de abonos / valor de cuota
```

Ejemplo verificado en el sistema: capital 1,000, tasa 20 %, 20 cuotas → total 1,200, cuota 60, interés 200. Otro crédito real: capital 1,200, tasa 20 %, 24 cuotas → total 1,440, cuota 60.

**Cronograma** (simulador): la primera cuota es **el día siguiente**.
- `DIARIO`: una cuota cada día. En los créditos reales el vencimiento muestra que **se omiten los domingos**.
- Día de la semana (`LUNES` … `DOMINGO`): primera cuota en el próximo día indicado y una cuota cada 7 días.
- `10 DIAS`, `15 DIAS`, `20 DIAS`, `30 DIAS`: una cuota cada N días.

**Cierre diario**

```
total día = base + recaudos − ventas − gastos        (más adiciones de capital)
efectividad de recaudo = recaudos / valor a recaudar del día
utilidad diaria aprox. = Σ pago × tasa / (100 + tasa)
```

**Otras reglas observadas**
- El pago admite cualquier valor (abono parcial) y se registra con forma de pago.
- No se puede modificar un crédito que ya tiene pagos vigentes.
- No existen dos clientes con la misma identificación dentro de una cartera.
- El día puede estar abierto o cerrado; el estado se muestra en el inicio.

## 6. Catálogos

| Catálogo | Valores |
|---|---|
| Utilidad (%) | 5, 7, 8, 10, 12, 14, 15, 20 (por defecto), 24, 26, 28, 30, 32, 36, 40, 50 |
| Cuotas | 1, 2, 3, 4, 6, 7, 8, 10, 11, 15, 20 (por defecto), 24, 30, 40, 42, 64, 90 |
| Periodo | DIARIO, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO, 10 DIAS, 15 DIAS, 20 DIAS, 30 DIAS |
| Tipo de gasto | ARRENDAMIENTO, AUXILIAR, CADENA, COMBUSTIBLE, MANTENIMIENTO VEHICULO, PARQUEADERO, SALARIO, SERVICIOS E INTERNET, TARJETAS, TELEFONO CELULAR (el listado se desplaza; puede haber más) |
| Forma de pago | Efectivo (`EF`), Transferencia (`TR`) |
| Calificación | Bueno, Regular, Malo |

## 7. Funciones que aparecen en el sistema pero no eran visibles con las cuentas probadas

El diccionario de textos del cliente menciona funciones de supervisión y administración que **no se pudieron recorrer**: carteras múltiples (selección, revisión y movimiento de cartera), base de dinero (capital inicial, adición de capital, valor actual de base, histórico de caja), apertura, cierre y reapertura del día, confirmación de cierre, rastreo del agente en mapa, mora por rangos (1–5, 6–10, 11–20, 21+ días, más de 30), clientes que deben pagar hoy, efectividad de recaudo, edición de cliente, modificación y eliminación de pagos, exportes a Excel y PDF, compartir, fotos y estadísticas.

Esta aplicación implementa las que pide la especificación de roles (base, apertura y cierre, edición de pagos, usuarios). El resto queda como ampliación posible.

## 8. Diferencias entre las cuentas probadas

- Mismo menú y mismas pantallas.
- Cada una trabaja una **cartera distinta**, con clientes y créditos propios.
- Los indicadores (tasa 1.20, cuotas 20, estado del día) son los mismos.

## 9. Endpoints observados (referencia)

`login/verificarserver`, `login/verificarsesion`, `login/tokenlogin`, `login/loginuser`, `login/logout`, `agente/inithome`, `agente/todosclientes`, `agente/clientesinactivos`, `agente/listarclientes`, `agente/buscaorden`, `agente/historiacredito`, `agente/clientepago`, `agente/historialnotas`, `agente/consultargastos`, `agente/prestamosvigentes`, `agente/movdiario`.
