# Publicar la aplicación en internet (un enlace, sin instalar nada)

Al terminar esta guía tendrás un enlace como `https://financiera.onrender.com` que cualquier persona de tu equipo abre en el navegador del teléfono o del computador, entra con su usuario y trabaja. No instalan nada. Funciona como gona.me: una dirección para todo.

> **Tiempo:** unos 30 minutos la primera vez. **Costo aproximado:** alrededor de US$ 7 al mes en Render (servicio + disco). Los precios cambian: confírmalos en https://render.com/pricing antes de pagar.

## Qué necesitas
- La cuenta de GitHub donde está este proyecto (ya la tienes).
- Una cuenta en [Render](https://render.com) (puedes registrarte con tu cuenta de GitHub) y una tarjeta de pago.
- Cinco datos que decides tú y anotas en un papel:

| Dato | Ejemplo | Para qué sirve |
|---|---|---|
| Código de la empresa | `1001` | Es el primer campo al iniciar sesión. |
| Nombre de la empresa | `Mi Empresa` | Aparece arriba en la app. |
| Usuario del administrador | `admin` | Tu usuario. |
| Nombre completo | `Ana Pérez` | Cómo te verá el sistema. |
| Contraseña | `Cobros2026x` | Mínimo 8 caracteres, con letras y números. |

También puedes poner nombre a la primera ruta o cartera (por defecto se llama «Principal»).

## Paso a paso

1. **Entra a Render** e inicia sesión con GitHub. Autoriza el acceso al repositorio `Aplicaci-n-financiera`.
2. Pulsa **New +** y elige **Blueprint**. Selecciona el repositorio.
3. **Elige la rama** `claude/epic-planck-sqnqgc` (ahí está el código; no hay otra rama).
4. Render leerá el archivo `render.yaml` y te mostrará lo que va a crear: **un servicio web** y **un disco de 1 GB** para los datos. Pide que completes las variables `ADMIN_…`: escribe los cinco datos que anotaste.
5. Pulsa **Apply** (o **Deploy**). La primera vez tarda entre 10 y 20 minutos, porque construye la aplicación.
6. Cuando el estado diga **Live**, copia el enlace que aparece arriba (termina en `.onrender.com`).
7. **Ábrelo.** Verás la pantalla de acceso. Entra con tu código, usuario y contraseña.
8. **Muy importante, una sola vez:** en Render ve a tu servicio → **Environment**, **elimina la variable `ADMIN_CLAVE`** y guarda. Ya no se necesita y es mejor que tu contraseña no quede escrita ahí.

Listo. Ya puedes crear a tu supervisor y a tus empleados desde la app: **Administración → Usuarios**.

### ¿Cómo sé que quedó bien?
Abre `tu-enlace/salud` en el navegador: debe mostrar `{"ok":true,…}`. Si alguien técnico te ayuda, puede ejecutar la verificación completa:

```bash
scripts/prueba-humo.sh https://tu-enlace.onrender.com 1001 admin TuContraseña
```

## Instalarla en el teléfono o el computador
La primera carga descarga unos 4 MB; después es rápida.
- **Android (Chrome):** menú ⋮ → *Instalar app* (o *Agregar a la pantalla de inicio*).
- **iPhone (Safari):** botón Compartir → *Agregar a la pantalla de inicio*.
- **Windows (Chrome o Edge):** el ícono de instalar al final de la barra de direcciones.

Queda con su ícono y se abre a pantalla completa, como una app.

## Un código QR para tu equipo
Cuando tengas el enlace, pásamelo y te genero la imagen del QR. También sirve cualquier generador gratuito de códigos QR.

## Un dominio propio (por ejemplo `tuempresa.com`)
1. Compra el dominio en cualquier proveedor (Namecheap, GoDaddy, etc.). Cuesta alrededor de US$ 10 a 20 al año.
2. En Render, tu servicio → **Settings → Custom Domains → Add Custom Domain** y escribe tu dominio.
3. Render te muestra uno o dos registros DNS. Cópialos en el panel de tu proveedor del dominio.
4. Espera unos minutos: Render activa el candado de HTTPS por su cuenta.

## Copias de seguridad (no te saltes esto)
Todo el negocio vive en un archivo dentro del disco del servicio. Antes de usarlo con datos reales:
- En Render, revisa tu disco (**Disks**) y activa las copias automáticas (*snapshots*) si tu plan las ofrece.
- Además, descarga copias de vez en cuando: desde la pestaña **Shell** de tu servicio ejecuta `npm run respaldo -- /data/copia-AAAA-MM-DD.db` y descárgala. Una copia que queda en el mismo disco no te protege si el disco se pierde.
- Prueba restaurar una copia al menos una vez.

## Actualizaciones
Cuando el código cambie en GitHub, Render vuelve a publicar solo (`autoDeploy`). Mientras se publica, la app puede tardar un par de minutos en responder. Los datos no se pierden: están en el disco.

## Si algo sale mal
| Qué ves | Qué hacer |
|---|---|
| El despliegue falla («Build failed») | Abre **Logs** en Render y pásame el final del texto. |
| «No se pudo crear el administrador inicial» en los registros | Alguna variable `ADMIN_…` está mal (la contraseña debe tener 8 o más caracteres, con letras y números). Corrígela en **Environment** y vuelve a desplegar. |
| No puedo entrar | Revisa el código de empresa, el usuario y la contraseña. Tras 5 intentos fallidos se bloquea 15 minutos. |
| Me equivoqué en el código o usuario del primer administrador | El alta inicial solo ocurre una vez. En **Shell** ejecuta `npm run crear-admin -- --codigo NUEVO --empresa "Nombre" --usuario admin --nombre "Tu Nombre"` (muestra una contraseña generada una sola vez). |
| La app tarda mucho en abrir tras un rato sin uso | Es normal en planes básicos que “duermen” el servicio. Un plan superior lo evita. |

## Seguridad en pocas líneas
- La conexión siempre va cifrada (HTTPS).
- Cada persona ve solo lo que su rol permite, y el servidor lo valida aunque alguien manipule la pantalla.
- Cambia tu contraseña desde la app (icono de cuenta → *Cambiar contraseña*) y no la compartas.
- Considera poner el repositorio de GitHub en **privado** (*Settings → Danger Zone → Change visibility*). Render puede seguir publicándolo.

## ¿Y si prefiero otro alojamiento?
Cualquier servicio que ejecute contenedores Docker sirve (Fly.io, Railway, un servidor propio…). Necesitas: el `Dockerfile` de este repositorio, un disco persistente montado en `/data`, y las variables de `render.yaml`. Los comandos están al inicio del `Dockerfile`.
