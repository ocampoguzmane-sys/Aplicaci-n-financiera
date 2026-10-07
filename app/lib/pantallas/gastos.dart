import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';

class PantallaAdicionarGasto extends StatefulWidget {
  const PantallaAdicionarGasto({super.key});

  @override
  State<PantallaAdicionarGasto> createState() => _PantallaAdicionarGastoState();
}

class _PantallaAdicionarGastoState extends State<PantallaAdicionarGasto> {
  final _valor = TextEditingController();
  final _detalle = TextEditingController();
  String? _tipo;

  @override
  void dispose() {
    _valor.dispose();
    _detalle.dispose();
    super.dispose();
  }

  Future<void> _registrar() async {
    final v = valorEntero(_valor.text);
    if (_tipo == null || v == null || v < 1) {
      mostrarMensaje(context, 'Elige el tipo de gasto y escribe el valor', error: true);
      return;
    }
    final s = context.read<Sesion>();
    try {
      await s.api.post('/api/v1/gastos', cuerpo: {'tipo': _tipo, 'valor': v, if (_detalle.text.trim().isNotEmpty) 'detalle': _detalle.text.trim()});
      if (!mounted) return;
      mostrarMensaje(context, 'Gasto registrado');
      setState(() {
        _tipo = null;
        _valor.clear();
        _detalle.clear();
      });
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tipos = context.read<Sesion>().catalogos!.tiposGasto;
    return MarcoPantalla(
      titulo: 'Ingresar gasto',
      hijo: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            DropdownButtonFormField<String>(
              key: ValueKey(_tipo),
              initialValue: _tipo,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Tipo de gasto'),
              hint: const Text('Selecciona un gasto'),
              items: [for (final t in tipos) DropdownMenuItem(value: t, child: Text(t))],
              onChanged: (v) => setState(() => _tipo = v),
            ),
            const SizedBox(height: 12),
            CampoDinero(controlador: _valor, etiqueta: 'Valor del gasto'),
            const SizedBox(height: 12),
            TextField(controller: _detalle, maxLength: 100, maxLines: 3, decoration: const InputDecoration(labelText: 'Detalle', hintText: 'Gasolina de la ruta')),
            const SizedBox(height: 8),
            BotonAccion(texto: 'Registrar Gasto', icono: Icons.check_circle_outline, alPulsar: _registrar),
          ],
        ),
      ),
    );
  }
}

class PantallaConsultarGastos extends StatefulWidget {
  const PantallaConsultarGastos({super.key});

  @override
  State<PantallaConsultarGastos> createState() => _PantallaConsultarGastosState();
}

class _PantallaConsultarGastosState extends State<PantallaConsultarGastos> {
  late DateTime _desde;
  late DateTime _hasta;
  int _version = 0;

  @override
  void initState() {
    super.initState();
    final hoy = context.read<Sesion>().dia?.fecha;
    _desde = _hasta = hoy != null ? desdeFechaIso(hoy) : DateTime.now();
  }

  Future<void> _elegir(bool inicial) async {
    final f = await elegirFecha(context, inicial ? _desde : _hasta);
    if (f == null) return;
    setState(() {
      if (inicial) {
        _desde = f;
        if (_hasta.isBefore(f)) _hasta = f;
      } else {
        _hasta = f;
        if (_desde.isAfter(f)) _desde = f;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Consultar gastos',
      hijo: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: Wrap(spacing: 8, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
              OutlinedButton.icon(onPressed: () => _elegir(true), icon: const Icon(Icons.event), label: Text('Desde ${textoFecha(_desde)}')),
              OutlinedButton.icon(onPressed: () => _elegir(false), icon: const Icon(Icons.event), label: Text('Hasta ${textoFecha(_hasta)}')),
              IconButton(tooltip: 'Actualizar', onPressed: () => setState(() => _version++), icon: const Icon(Icons.refresh)),
            ]),
          ),
          Expanded(
            child: Cargador<ConsultaGastos>(
              key: ValueKey('${aFechaIso(_desde)}-${aFechaIso(_hasta)}-$_version'),
              cargar: () async => ConsultaGastos.fromJson(await s.api.get('/api/v1/gastos', consulta: {'desde': aFechaIso(_desde), 'hasta': aFechaIso(_hasta)}) as Json),
              constructor: (context, datos, recargar) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(children: [const Text('Total gastos: '), Etiqueta(dinero(datos.total), color: Colors.red.shade700)]),
                  ),
                  Expanded(
                    child: datos.items.isEmpty
                        ? const Vacio('No hay gastos en este rango')
                        : ListView.separated(
                            padding: const EdgeInsets.all(12),
                            itemCount: datos.items.length,
                            separatorBuilder: (_, _) => const SizedBox(height: 6),
                            itemBuilder: (_, i) => _FilaGasto(gasto: datos.items[i], recargar: recargar),
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

class _FilaGasto extends StatelessWidget {
  const _FilaGasto({required this.gasto, required this.recargar});
  final Gasto gasto;
  final Future<void> Function() recargar;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    final g = gasto;
    final editable = s.puede('gastos.editar') && (s.dia?.abierto ?? false) && g.fecha == s.dia?.fecha;
    return Card(
      child: ListTile(
        title: Text('${g.tipo}  ·  ${dinero(g.valor)}', style: const TextStyle(fontWeight: FontWeight.w700)),
        subtitle: Text('${fechaLarga(g.fecha)} · ${g.usuario}${g.detalle.isEmpty ? '' : '\n${g.detalle}'}'),
        isThreeLine: g.detalle.isNotEmpty,
        trailing: editable
            ? Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(tooltip: 'Editar', icon: const Icon(Icons.edit_outlined), onPressed: () => _editar(context)),
                IconButton(tooltip: 'Anular', icon: Icon(Icons.delete_outline, color: Colors.red.shade700), onPressed: () => _anular(context)),
              ])
            : null,
      ),
    );
  }

  Future<void> _anular(BuildContext context) async {
    final s = context.read<Sesion>();
    if (!await confirmar(context, 'Anular gasto', 'Se anulará el gasto de ${dinero(gasto.valor)} (${gasto.tipo}).', aceptar: 'Anular')) return;
    try {
      await s.api.delete('/api/v1/gastos/${gasto.id}');
      if (context.mounted) mostrarMensaje(context, 'Gasto anulado');
      await recargar();
    } catch (e) {
      if (context.mounted) mostrarError(context, e);
    }
  }

  Future<void> _editar(BuildContext context) async {
    final s = context.read<Sesion>();
    final valor = TextEditingController(text: miles(gasto.valor));
    final detalle = TextEditingController(text: gasto.detalle);
    String tipo = gasto.tipo;
    final tipos = s.catalogos!.tiposGasto;
    final guardado = await mostrarDialogo<bool>(
      context,
      liberar: [valor, detalle],
      builder: (c) => StatefulBuilder(
        builder: (c, setState) => AlertDialog(
          title: const Text('Editar gasto'),
          content: SizedBox(
            width: 420,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              DropdownButtonFormField<String>(
                initialValue: tipos.contains(tipo) ? tipo : null,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Tipo de gasto'),
                items: [for (final t in tipos) DropdownMenuItem(value: t, child: Text(t))],
                onChanged: (v) => setState(() => tipo = v ?? tipo),
              ),
              const SizedBox(height: 12),
              CampoDinero(controlador: valor, etiqueta: 'Valor del gasto'),
              const SizedBox(height: 12),
              TextField(controller: detalle, maxLength: 100, decoration: const InputDecoration(labelText: 'Detalle')),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                final v = valorEntero(valor.text);
                if (v == null || v < 1) return;
                try {
                  await s.api.patch('/api/v1/gastos/${gasto.id}', cuerpo: {'tipo': tipo, 'valor': v, 'detalle': detalle.text.trim()});
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
      if (context.mounted) mostrarMensaje(context, 'Gasto actualizado');
      await recargar();
    }
  }
}
