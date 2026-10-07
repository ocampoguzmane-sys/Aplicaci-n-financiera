import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';
import '../widgets/credito_form.dart';
import 'pagos.dart';
import 'ventas.dart';

/// Listado de clientes: `todos` o `inactivos` (sin crédito vigente).
class PantallaClientes extends StatefulWidget {
  const PantallaClientes({super.key, required this.filtro});
  final String filtro;

  @override
  State<PantallaClientes> createState() => _PantallaClientesState();
}

class _PantallaClientesState extends State<PantallaClientes> {
  String _q = '';

  bool get _inactivos => widget.filtro == 'inactivos';

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: _inactivos ? 'Clientes Inactivos' : 'Todos los Clientes',
      hijo: Column(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 4), child: CampoBusqueda(alCambiar: (t) => setState(() => _q = t), sugerencia: 'Buscar por nombre, identificación o barrio')),
          Expanded(
            child: Cargador<ListaClientes>(
              key: ValueKey('${widget.filtro}-$_q'),
              cargar: () async => ListaClientes.fromJson(await s.api.get('/api/v1/clientes', consulta: {'estado': widget.filtro, 'q': _q}) as Json),
              constructor: (context, datos, recargar) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Row(children: [
                      const Text('Total clientes: '),
                      Etiqueta('${datos.totalClientes}', color: Colors.blue.shade700),
                      const SizedBox(width: 16),
                      const Text('Activos: '),
                      Etiqueta('${datos.clientesActivos}', color: Colors.purple.shade700),
                    ]),
                  ),
                  Expanded(
                    child: datos.items.isEmpty
                        ? Vacio(_inactivos ? 'No hay clientes inactivos' : 'No hay clientes')
                        : RefreshIndicator(
                            onRefresh: recargar,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: datos.items.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (_, i) => _TarjetaCliente(cliente: datos.items[i], inactivos: _inactivos, recargar: recargar),
                            ),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TarjetaCliente extends StatelessWidget {
  const _TarjetaCliente({required this.cliente, required this.inactivos, required this.recargar});
  final ResumenCliente cliente;
  final bool inactivos;
  final Future<void> Function() recargar;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    final c = cliente;
    final acciones = <Widget>[
      if (inactivos) ...[
        if (s.puede('creditos.vender'))
          FilledButton.icon(
            onPressed: () async {
              if (await mostrarVenta(context, c)) await recargar();
            },
            icon: const Icon(Icons.point_of_sale, size: 18),
            label: const Text('Vender'),
          ),
        OutlinedButton.icon(onPressed: () => _verUltimoCredito(context), icon: const Icon(Icons.list_alt, size: 18), label: const Text('Ver')),
      ] else ...[
        FilledButton.icon(onPressed: () => mostrarDatosCliente(context, c.id, alCambiar: recargar), icon: const Icon(Icons.person_outline, size: 18), label: const Text('Datos Cliente')),
        if (s.puede('clientes.referencias.crear')) OutlinedButton.icon(onPressed: () => _crearReferencia(context, c), icon: const Icon(Icons.playlist_add, size: 18), label: const Text('Crear Referencia')),
      ],
    ];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(Icons.circle, size: 10, color: colorCalificacion(c.calificacion)),
                    const SizedBox(width: 6),
                    Expanded(child: Text(c.nombre.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700))),
                  ]),
                  const SizedBox(height: 4),
                  Text.rich(TextSpan(children: [
                    const TextSpan(text: 'Vigentes: '),
                    TextSpan(text: '${c.vigentes}', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.red.shade700)),
                    const TextSpan(text: '   Pagados: '),
                    TextSpan(text: '${c.pagados}', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.green.shade700)),
                    const TextSpan(text: '   Total: '),
                    TextSpan(text: '${c.total}', style: TextStyle(fontWeight: FontWeight.w700, color: Colors.blue.shade700)),
                  ])),
                  Text('Barrio: ${c.barrio}', style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ],
              ),
            ),
            const SizedBox(width: 8),
            IntrinsicWidth(child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [for (final a in acciones) Padding(padding: const EdgeInsets.only(bottom: 6), child: a)])),
          ],
        ),
      ),
    );
  }

  Future<void> _verUltimoCredito(BuildContext context) async {
    final s = context.read<Sesion>();
    try {
      final d = DetalleCliente.fromJson(await s.api.get('/api/v1/clientes/${cliente.id}') as Json);
      if (d.creditoIds.isEmpty) {
        if (context.mounted) mostrarMensaje(context, 'El cliente no tiene créditos');
        return;
      }
      if (context.mounted) await mostrarInformeCredito(context, d.creditoIds.first);
    } catch (e) {
      if (context.mounted) mostrarError(context, e);
    }
  }

  Future<void> _crearReferencia(BuildContext context, ResumenCliente c) async {
    final s = context.read<Sesion>();
    final nombres = TextEditingController();
    final direccion = TextEditingController();
    final barrio = TextEditingController();
    final telefono = TextEditingController();
    final detalle = TextEditingController();
    await mostrarHoja<void>(
      context,
      titulo: 'Crear referencia',
      subtitulo: c.nombre.toUpperCase(),
      liberar: [nombres, direccion, barrio, telefono, detalle],
      contenido: (sheet) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(controller: nombres, decoration: const InputDecoration(labelText: 'Nombres')),
          const SizedBox(height: 12),
          TextField(controller: direccion, decoration: const InputDecoration(labelText: 'Dirección')),
          const SizedBox(height: 12),
          TextField(controller: barrio, decoration: const InputDecoration(labelText: 'Barrio')),
          const SizedBox(height: 12),
          TextField(controller: telefono, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono')),
          const SizedBox(height: 12),
          TextField(controller: detalle, maxLength: 100, maxLines: 2, decoration: const InputDecoration(labelText: 'Información adicional', hintText: 'Detalles para ubicar el lugar o identificar al cliente')),
          const SizedBox(height: 8),
          BotonAccion(
            texto: 'Guardar',
            alPulsar: () async {
              try {
                await s.api.post('/api/v1/clientes/${c.id}/referencias', cuerpo: {
                  'nombres': nombres.text.trim(),
                  'direccion': direccion.text.trim(),
                  'barrio': barrio.text.trim(),
                  'telefono': telefono.text.trim(),
                  'detalle': detalle.text.trim(),
                });
                if (sheet.mounted) Navigator.pop(sheet);
                if (context.mounted) mostrarMensaje(context, 'Referencia guardada');
              } catch (e) {
                if (sheet.mounted) mostrarError(sheet, e);
              }
            },
          ),
        ],
      ),
    );
  }
}

/// Datos del cliente. Quien puede editar clientes ve el botón Editar.
Future<void> mostrarDatosCliente(BuildContext context, int clienteId, {Future<void> Function()? alCambiar}) {
  return showDialog<void>(
    context: context,
    builder: (_) => Dialog(
      insetPadding: const EdgeInsets.all(12),
      child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520, maxHeight: 640), child: _DatosCliente(clienteId: clienteId, alCambiar: alCambiar)),
    ),
  );
}

class _DatosCliente extends StatefulWidget {
  const _DatosCliente({required this.clienteId, this.alCambiar});
  final int clienteId;
  final Future<void> Function()? alCambiar;

  @override
  State<_DatosCliente> createState() => _DatosClienteState();
}

class _DatosClienteState extends State<_DatosCliente> {
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return Cargador<DetalleCliente>(
      key: ValueKey(_version),
      cargar: () async => DetalleCliente.fromJson(await s.api.get('/api/v1/clientes/${widget.clienteId}') as Json),
      constructor: (context, d, _) => Column(
        children: [
          ListTile(
            title: const Text('Datos cliente', style: TextStyle(fontWeight: FontWeight.w700)),
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              Etiqueta(d.calificacion, color: colorCalificacion(d.calificacion)),
              IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
            ]),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(d.nombre.toUpperCase(), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                FilaDato('Identificación', d.identificacion, destacado: true),
                FilaDato('Teléfono', d.telefono, destacado: true),
                FilaDato('Dirección', d.direccion, destacado: true),
                FilaDato('Barrio', d.barrio, destacado: true),
                if (d.referencias.isNotEmpty) ...[
                  const Divider(height: 24),
                  Text('Referencias', style: Theme.of(context).textTheme.titleSmall),
                  for (final r in d.referencias)
                    Card(
                      color: Theme.of(context).colorScheme.surfaceContainerLow,
                      child: Padding(
                        padding: const EdgeInsets.all(10),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(r.nombres, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${r.telefono} · ${r.direccion} · ${r.barrio}'),
                          if (r.detalle.isNotEmpty) Text(r.detalle, style: const TextStyle(fontSize: 12)),
                        ]),
                      ),
                    ),
                ],
                if (_puedeEditar(context)) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(onPressed: () => _editar(context, d), icon: const Icon(Icons.edit_outlined), label: const Text('Editar')),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  bool _puedeEditar(BuildContext context) => context.read<Sesion>().puede('clientes.editar');

  Future<void> _editar(BuildContext context, DetalleCliente d) async {
    final s = context.read<Sesion>();
    final id = TextEditingController(text: d.identificacion);
    final nombres = TextEditingController(text: d.nombres);
    final apellidos = TextEditingController(text: d.apellidos);
    final direccion = TextEditingController(text: d.direccion);
    final barrio = TextEditingController(text: d.barrio);
    final telefono = TextEditingController(text: d.telefono);
    String calificacion = d.calificacion;
    final guardado = await mostrarDialogo<bool>(
      context,
      liberar: [id, nombres, apellidos, direccion, barrio, telefono],
      builder: (c) => StatefulBuilder(
        builder: (c, setState) => AlertDialog(
          title: const Text('Editar cliente'),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                TextField(controller: id, decoration: const InputDecoration(labelText: 'Identificación')),
                const SizedBox(height: 10),
                TextField(controller: nombres, decoration: const InputDecoration(labelText: 'Nombres')),
                const SizedBox(height: 10),
                TextField(controller: apellidos, decoration: const InputDecoration(labelText: 'Apellidos')),
                const SizedBox(height: 10),
                TextField(controller: direccion, decoration: const InputDecoration(labelText: 'Dirección')),
                const SizedBox(height: 10),
                TextField(controller: barrio, decoration: const InputDecoration(labelText: 'Barrio')),
                const SizedBox(height: 10),
                TextField(controller: telefono, decoration: const InputDecoration(labelText: 'Teléfono')),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: calificacion,
                  decoration: const InputDecoration(labelText: 'Calificación'),
                  items: [for (final k in s.catalogos!.calificaciones) DropdownMenuItem(value: k, child: Text(k))],
                  onChanged: (v) => setState(() => calificacion = v ?? calificacion),
                ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                try {
                  await s.api.patch('/api/v1/clientes/${d.id}', cuerpo: {
                    'identificacion': id.text.trim(),
                    'nombres': nombres.text.trim(),
                    'apellidos': apellidos.text.trim(),
                    'direccion': direccion.text.trim(),
                    'barrio': barrio.text.trim(),
                    'telefono': telefono.text.trim(),
                    'calificacion': calificacion,
                  });
                  if (c.mounted) Navigator.pop(c, true);
                } catch (e) {
                  if (c.mounted) mostrarError(c, e);
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        ),
      ),
    );
    if (guardado == true) {
      if (context.mounted) mostrarMensaje(context, 'Cliente actualizado');
      if (!mounted) return;
      setState(() => _version++);
      await widget.alCambiar?.call();
    }
  }
}

/// Alta de cliente con las condiciones de su primer crédito.
class PantallaNuevoCliente extends StatefulWidget {
  const PantallaNuevoCliente({super.key});

  @override
  State<PantallaNuevoCliente> createState() => _PantallaNuevoClienteState();
}

class _PantallaNuevoClienteState extends State<PantallaNuevoCliente> {
  final _formulario = GlobalKey<FormState>();
  final _id = TextEditingController();
  final _nombres = TextEditingController();
  final _apellidos = TextEditingController();
  final _direccion = TextEditingController();
  final _barrio = TextEditingController();
  final _telefono = TextEditingController();
  late final CondicionesCredito _cond;

  @override
  void initState() {
    super.initState();
    _cond = CondicionesCredito(context.read<Sesion>().catalogos!);
  }

  @override
  void dispose() {
    for (final t in [_id, _nombres, _apellidos, _direccion, _barrio, _telefono]) {
      t.dispose();
    }
    _cond.dispose();
    super.dispose();
  }

  String? _obligatorio(String? v) => (v == null || v.trim().isEmpty) ? 'Obligatorio' : null;

  Future<void> _crear() async {
    if (!_formulario.currentState!.validate()) return;
    final valor = _cond.valorArticulo;
    if (valor == null || valor < 1) {
      mostrarMensaje(context, 'Escribe el valor del artículo', error: true);
      return;
    }
    final s = context.read<Sesion>();
    try {
      await s.api.post('/api/v1/clientes', cuerpo: {
        'identificacion': _id.text.trim(),
        'nombres': _nombres.text.trim(),
        'apellidos': _apellidos.text.trim(),
        'direccion': _direccion.text.trim(),
        'barrio': _barrio.text.trim(),
        'telefono': _telefono.text.trim(),
        'credito': _cond.aJson(),
      });
      if (!mounted) return;
      mostrarMensaje(context, 'Cliente creado');
      Navigator.pop(context);
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cat = context.read<Sesion>().catalogos!;
    return MarcoPantalla(
      titulo: 'Nuevo cliente',
      hijo: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formulario,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              TextFormField(controller: _id, keyboardType: TextInputType.text, validator: _obligatorio, decoration: const InputDecoration(labelText: 'Identificación', hintText: '1053965412')),
              const SizedBox(height: 12),
              LayoutBuilder(builder: (context, caja) {
                final nombres = TextFormField(controller: _nombres, validator: _obligatorio, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombres'));
                final apellidos = TextFormField(controller: _apellidos, validator: _obligatorio, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Apellidos'));
                return caja.maxWidth < 480
                    ? Column(children: [nombres, const SizedBox(height: 12), apellidos])
                    : Row(children: [Expanded(child: nombres), const SizedBox(width: 12), Expanded(child: apellidos)]);
              }),
              const SizedBox(height: 12),
              TextFormField(controller: _direccion, validator: _obligatorio, decoration: const InputDecoration(labelText: 'Dirección')),
              const SizedBox(height: 12),
              LayoutBuilder(builder: (context, caja) {
                final barrio = TextFormField(controller: _barrio, validator: _obligatorio, decoration: const InputDecoration(labelText: 'Barrio'));
                final telefono = TextFormField(controller: _telefono, validator: _obligatorio, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Teléfono'));
                return caja.maxWidth < 480
                    ? Column(children: [barrio, const SizedBox(height: 12), telefono])
                    : Row(children: [Expanded(child: barrio), const SizedBox(width: 12), Expanded(child: telefono)]);
              }),
              const Divider(height: 32),
              Text('Primer crédito', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 12),
              FormularioCredito(condiciones: _cond, catalogos: cat),
              const SizedBox(height: 20),
              BotonAccion(texto: 'Crear Cliente', icono: Icons.check_circle_outline, alPulsar: _crear),
            ],
          ),
        ),
      ),
    );
  }
}

/// Orden de la ruta: alfabético, o personalizado arrastrando a los clientes.
class PantallaEnrutamiento extends StatefulWidget {
  const PantallaEnrutamiento({super.key});

  @override
  State<PantallaEnrutamiento> createState() => _PantallaEnrutamientoState();
}

class _PantallaEnrutamientoState extends State<PantallaEnrutamiento> {
  List<ResumenCliente>? _clientes;
  bool _personalizado = false;
  Object? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    final s = context.read<Sesion>();
    try {
      final r = ListaClientes.fromJson(await s.api.get('/api/v1/clientes') as Json);
      if (!mounted) return;
      setState(() {
        _clientes = r.items;
        _personalizado = s.cartera?.ordenModo == 'PERSONALIZADO';
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _guardar() async {
    final s = context.read<Sesion>();
    try {
      await s.api.put('/api/v1/clientes/orden', cuerpo: {
        'modo': _personalizado ? 'PERSONALIZADO' : 'ALFABETICO',
        if (_personalizado) 'orden': [for (final c in _clientes!) c.id],
      });
      await s.recargarCarteras();
      if (mounted) mostrarMensaje(context, 'Orden de la ruta guardado');
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final clientes = _clientes;
    return MarcoPantalla(
      titulo: 'Enrutamiento',
      hijo: clientes == null
          ? (_error != null ? Vacio('$_error', icono: Icons.cloud_off) : const Center(child: CircularProgressIndicator()))
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    const Text('Orden de la ruta: '),
                    const SizedBox(width: 8),
                    SegmentedButton<bool>(
                      segments: const [ButtonSegment(value: false, label: Text('Alfabético')), ButtonSegment(value: true, label: Text('Personalizado'))],
                      selected: {_personalizado},
                      onSelectionChanged: (v) => setState(() => _personalizado = v.first),
                    ),
                    const Spacer(),
                    BotonAccion(texto: 'Guardar', icono: Icons.save_outlined, alPulsar: _guardar),
                  ]),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Text(_personalizado ? 'Arrastra a los clientes a la posición deseada y pulsa Guardar.' : 'Los clientes se ordenan automáticamente según su nombre.', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
                const SizedBox(height: 8),
                Expanded(
                  child: _personalizado
                      ? ReorderableListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: clientes.length,
                          onReorderItem: (a, b) => setState(() => clientes.insert(b, clientes.removeAt(a))),
                          itemBuilder: (_, i) => Card(
                            key: ValueKey(clientes[i].id),
                            child: ListTile(
                              dense: true,
                              leading: CircleAvatar(radius: 14, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))),
                              title: Text(clientes[i].nombre.toUpperCase()),
                              subtitle: Text(clientes[i].barrio),
                              trailing: const Icon(Icons.drag_handle),
                            ),
                          ),
                        )
                      : ListView.builder(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          itemCount: clientes.length,
                          itemBuilder: (_, i) => Card(
                            child: ListTile(dense: true, leading: CircleAvatar(radius: 14, child: Text('${i + 1}', style: const TextStyle(fontSize: 12))), title: Text(clientes[i].nombre.toUpperCase()), subtitle: Text(clientes[i].barrio)),
                          ),
                        ),
                ),
              ],
            ),
    );
  }
}
