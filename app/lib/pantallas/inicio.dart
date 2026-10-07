import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';
import '../widgets/comunes.dart';
import 'admin.dart';
import 'clientes.dart';
import 'gastos.dart';
import 'pagos.dart';
import 'reportes.dart';
import 'ventas.dart';

void abrir(BuildContext context, Widget pantalla) => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => pantalla));

class PantallaInicio extends StatelessWidget {
  const PantallaInicio({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Sesion>();
    final tema = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Financiera', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (s.empresa != null) Text(s.empresa!.nombre.toUpperCase(), style: const TextStyle(fontSize: 11, letterSpacing: 1)),
          ],
        ),
        actions: [
          if (s.puedeElegirCartera) const _SelectorCartera(),
          const _MenuUsuario(),
          const SizedBox(width: 4),
        ],
      ),
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1000),
            child: RefreshIndicator(
              onRefresh: () async {
                try {
                  await s.refrescarDia();
                } catch (_) {}
              },
              child: ListView(
                padding: const EdgeInsets.all(12),
                children: [
                  if (s.cartera == null)
                    Card(
                      color: tema.colorScheme.tertiaryContainer,
                      child: const Padding(
                        padding: EdgeInsets.all(16),
                        child: Text('No tienes una cartera asignada. Pide a un administrador que te asigne una.'),
                      ),
                    )
                  else ...[
                    const _TarjetaDia(),
                    const SizedBox(height: 12),
                    _Accesos(sesion: s),
                    const SizedBox(height: 12),
                    _Grupos(sesion: s),
                    const SizedBox(height: 12),
                    _Indicadores(sesion: s),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TarjetaDia extends StatelessWidget {
  const _TarjetaDia();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Sesion>();
    final dia = s.dia;
    final abierto = dia?.abierto ?? false;
    final tema = Theme.of(context);
    final color = abierto ? Colors.green.shade700 : Colors.red.shade700;

    Future<void> cambiar(Future<void> Function() accion, String ok) async {
      try {
        await accion();
        if (context.mounted) mostrarMensaje(context, ok);
      } catch (e) {
        if (context.mounted) mostrarError(context, e);
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(abierto ? Icons.lock_open : Icons.lock_outline, color: color, size: 32),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Día ${dia?.etiqueta.toLowerCase() ?? '…'}', style: tema.textTheme.titleMedium?.copyWith(color: color, fontWeight: FontWeight.w700)),
                  if (dia != null) Text(fechaLarga(dia.fecha), style: TextStyle(color: tema.colorScheme.onSurfaceVariant)),
                  if (dia != null && !abierto) Text(dia.cierreAutomatico ? 'Se cerró automáticamente a medianoche.' : 'Ábrelo para registrar pagos, ventas y gastos.', style: const TextStyle(fontSize: 12)),
                ],
              ),
            ),
            if (s.puede('dia.gestionar') && dia != null)
              abierto
                  ? OutlinedButton(
                      onPressed: () async {
                        final ok = await confirmar(context, 'Cerrar el día', 'Después de cerrarlo no se podrán registrar pagos, ventas ni gastos hasta abrirlo de nuevo.', aceptar: 'Cerrar día');
                        if (ok) await cambiar(s.cerrarDia, 'Día cerrado');
                      },
                      child: const Text('Cerrar día'),
                    )
                  : FilledButton(onPressed: () => cambiar(s.abrirDia, 'Día abierto'), child: const Text('Abrir día')),
          ],
        ),
      ),
    );
  }
}

class _Accesos extends StatelessWidget {
  const _Accesos({required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[
      if (sesion.puede('pagos.crear')) _Acceso(Icons.payments_outlined, 'Registrar Pagos', Colors.blue.shade700, () => abrir(context, const PantallaPagos())),
      if (sesion.puede('creditos.vender')) _Acceso(Icons.point_of_sale, 'Registrar Ventas', Colors.red.shade700, () => abrir(context, const PantallaVentas())),
    ];
    if (items.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Wrap(alignment: WrapAlignment.center, spacing: 8, runSpacing: 4, children: items),
      ),
    );
  }
}

class _Acceso extends StatelessWidget {
  const _Acceso(this.icono, this.texto, this.color, this.alPulsar);
  final IconData icono;
  final String texto;
  final Color color;
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) => TextButton.icon(
        onPressed: alPulsar,
        icon: Icon(icono, color: color),
        label: Text(texto, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
        style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14)),
      );
}

class _Grupos extends StatelessWidget {
  const _Grupos({required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final p = sesion.puede;
    final grupos = <_Grupo>[
      _Grupo('Clientes', Colors.blue, [
        if (p('clientes.crear')) _Opcion(Icons.person_add_alt_1, 'Nuevo', () => abrir(context, const PantallaNuevoCliente())),
        _Opcion(Icons.person_off_outlined, 'Inactivos', () => abrir(context, const PantallaClientes(filtro: 'inactivos'))),
        _Opcion(Icons.groups_outlined, 'Todos', () => abrir(context, const PantallaClientes(filtro: 'todos'))),
        if (p('clientes.enrutar')) _Opcion(Icons.alt_route, 'Enrutamiento', () => abrir(context, const PantallaEnrutamiento())),
      ]),
      _Grupo('Gastos', Colors.orange, [
        if (p('gastos.crear')) _Opcion(Icons.local_gas_station_outlined, 'Adicionar', () => abrir(context, const PantallaAdicionarGasto())),
        _Opcion(Icons.manage_search, 'Consultar', () => abrir(context, const PantallaConsultarGastos())),
      ]),
      _Grupo('Reportes', Colors.purple, [
        _Opcion(Icons.receipt_long_outlined, 'Transacciones', () => abrir(context, const PantallaTransacciones())),
        _Opcion(Icons.fact_check_outlined, 'Cierres', () => abrir(context, const PantallaCierres())),
        _Opcion(Icons.calculate_outlined, 'Simulador', () => abrir(context, const PantallaSimulador())),
        _Opcion(Icons.sticky_note_2_outlined, 'Historial Notas', () => abrir(context, const PantallaNotas())),
      ]),
      _Grupo('Administración', Colors.teal, [
        _Opcion(Icons.savings_outlined, 'Base', () => abrir(context, const PantallaBase())),
        if (p('usuarios.gestionar')) _Opcion(Icons.manage_accounts_outlined, 'Usuarios', () => abrir(context, const PantallaUsuarios())),
        if (p('carteras.gestionar')) _Opcion(Icons.folder_shared_outlined, 'Carteras', () => abrir(context, const PantallaCarteras())),
      ]),
    ];
    return LayoutBuilder(builder: (context, caja) {
      final columnas = caja.maxWidth >= 900 ? 3 : (caja.maxWidth >= 560 ? 2 : 1);
      final ancho = (caja.maxWidth - 12 * (columnas - 1)) / columnas;
      return Wrap(spacing: 12, runSpacing: 12, children: [for (final g in grupos) SizedBox(width: ancho, child: g)]);
    });
  }
}

class _Opcion {
  const _Opcion(this.icono, this.texto, this.alPulsar);
  final IconData icono;
  final String texto;
  final VoidCallback alPulsar;
}

class _Grupo extends StatelessWidget {
  const _Grupo(this.titulo, this.color, this.opciones);
  final String titulo;
  final MaterialColor color;
  final List<_Opcion> opciones;

  @override
  Widget build(BuildContext context) => Card(
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(height: 4, color: color.shade400),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text(titulo, style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            ),
            for (final o in opciones)
              ListTile(
                dense: true,
                leading: Icon(o.icono, color: color.shade700),
                title: Text(o.texto, style: const TextStyle(fontWeight: FontWeight.w600)),
                trailing: const Icon(Icons.chevron_right, size: 18),
                onTap: o.alPulsar,
              ),
            const SizedBox(height: 4),
          ],
        ),
      );
}

class _Indicadores extends StatelessWidget {
  const _Indicadores({required this.sesion});
  final Sesion sesion;

  @override
  Widget build(BuildContext context) {
    final dia = sesion.dia;
    Widget indicador(IconData i, String etiqueta, String valor, Color c) => Expanded(
          child: Card(
            color: Theme.of(context).colorScheme.surfaceContainerLow,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
              child: Column(children: [
                Text(etiqueta, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                const SizedBox(height: 4),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(i, size: 16, color: c),
                  const SizedBox(width: 4),
                  Flexible(child: Text(valor, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
                ]),
              ]),
            ),
          ),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Icon(Icons.pie_chart_outline, size: 18, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 6),
              const Text('Indicadores de la ruta', style: TextStyle(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              indicador(Icons.percent, 'Tasa', sesion.tasa.toStringAsFixed(2), Colors.blue),
              const SizedBox(width: 8),
              indicador(Icons.tag, 'Cuotas', '${sesion.catalogos?.cuotasPorDefecto ?? 20}', Colors.green),
              const SizedBox(width: 8),
              indicador(Icons.event_available, 'Estado Día', dia?.etiqueta ?? '—', dia?.abierto == true ? Colors.green : Colors.red),
            ]),
          ],
        ),
      ),
    );
  }
}

class _SelectorCartera extends StatelessWidget {
  const _SelectorCartera();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Sesion>();
    return PopupMenuButton<int>(
      tooltip: 'Cambiar de cartera',
      icon: const Icon(Icons.swap_horiz),
      onSelected: (id) async {
        try {
          await s.seleccionarCartera(s.carteras.firstWhere((c) => c.id == id));
        } catch (e) {
          if (context.mounted) mostrarError(context, e);
        }
      },
      itemBuilder: (_) => [
        for (final c in s.carteras)
          CheckedPopupMenuItem<int>(value: c.id, checked: c.id == s.cartera?.id, child: Text(c.nombre)),
      ],
    );
  }
}

class _MenuUsuario extends StatelessWidget {
  const _MenuUsuario();

  @override
  Widget build(BuildContext context) {
    final s = context.watch<Sesion>();
    final u = s.usuario;
    return PopupMenuButton<String>(
      tooltip: 'Cuenta',
      icon: const Icon(Icons.account_circle_outlined),
      onSelected: (v) async {
        if (v == 'clave') {
          await _cambiarClave(context);
        } else if (v == 'salir') {
          await s.cerrarSesion();
        }
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(u?.nombre ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
            Text(u?.etiquetaRol ?? '', style: const TextStyle(fontSize: 12)),
          ]),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem(value: 'clave', child: ListTile(dense: true, leading: Icon(Icons.key), title: Text('Cambiar contraseña'))),
        const PopupMenuItem(value: 'salir', child: ListTile(dense: true, leading: Icon(Icons.logout), title: Text('Salir'))),
      ],
    );
  }

  Future<void> _cambiarClave(BuildContext context) async {
    final s = context.read<Sesion>();
    final actual = TextEditingController();
    final nueva = TextEditingController();
    String? error;
    await mostrarDialogo<void>(
      context,
      liberar: [actual, nueva],
      builder: (c) => StatefulBuilder(
        builder: (c, setState) => AlertDialog(
          title: const Text('Cambiar contraseña'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: actual, obscureText: true, decoration: const InputDecoration(labelText: 'Contraseña actual')),
            const SizedBox(height: 12),
            TextField(controller: nueva, obscureText: true, decoration: const InputDecoration(labelText: 'Nueva contraseña', helperText: 'Mínimo 8 caracteres, con letras y números')),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(error!, style: TextStyle(color: Theme.of(c).colorScheme.error))),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                try {
                  await s.api.post('/api/v1/auth/cambiar-clave', cuerpo: {'actual': actual.text, 'nueva': nueva.text});
                  if (c.mounted) Navigator.pop(c);
                  if (context.mounted) mostrarMensaje(context, 'Contraseña actualizada');
                } catch (e) {
                  setState(() => error = '$e');
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
  }
}
