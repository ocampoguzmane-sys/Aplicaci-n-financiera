import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';
import '../widgets/credito_form.dart';

/// Barra con la fecha consultada; al cambiarla se vuelve a consultar.
class _BarraFecha extends StatelessWidget {
  const _BarraFecha({required this.fecha, required this.alCambiar, required this.alActualizar});
  final DateTime fecha;
  final ValueChanged<DateTime> alCambiar;
  final VoidCallback alActualizar;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(12),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          IconButton(tooltip: 'Día anterior', icon: const Icon(Icons.chevron_left), onPressed: () => alCambiar(fecha.subtract(const Duration(days: 1)))),
          OutlinedButton.icon(
            onPressed: () async {
              final f = await elegirFecha(context, fecha);
              if (f != null) alCambiar(f);
            },
            icon: const Icon(Icons.event),
            label: Text(textoFecha(fecha)),
          ),
          IconButton(tooltip: 'Día siguiente', icon: const Icon(Icons.chevron_right), onPressed: () => alCambiar(fecha.add(const Duration(days: 1)))),
          IconButton(tooltip: 'Actualizar', icon: const Icon(Icons.refresh), onPressed: alActualizar),
        ]),
      );
}

DateTime _hoy(BuildContext context) {
  final f = context.read<Sesion>().dia?.fecha;
  return f != null ? desdeFechaIso(f) : DateTime.now();
}

class PantallaTransacciones extends StatefulWidget {
  const PantallaTransacciones({super.key});

  @override
  State<PantallaTransacciones> createState() => _PantallaTransaccionesState();
}

class _PantallaTransaccionesState extends State<PantallaTransacciones> {
  late DateTime _fecha = _hoy(context);
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Transacciones',
      hijo: Column(
        children: [
          _BarraFecha(fecha: _fecha, alCambiar: (f) => setState(() => _fecha = f), alActualizar: () => setState(() => _version++)),
          Expanded(
            child: Cargador<Transacciones>(
              key: ValueKey('${aFechaIso(_fecha)}-$_version'),
              cargar: () async => Transacciones.fromJson(await s.api.get('/api/v1/reportes/transacciones', consulta: {'fecha': aFechaIso(_fecha)}) as Json),
              constructor: (context, t, _) => DefaultTabController(
                length: 3,
                child: Column(children: [
                  TabBar(tabs: [Tab(text: 'Pagos (${t.pagos.length})'), Tab(text: 'Créditos (${t.creditos.length})'), Tab(text: 'Gastos (${t.gastos.length})')]),
                  Expanded(
                    child: TabBarView(children: [_TabPagos(t), _TabCreditos(t), _TabGastos(t)]),
                  ),
                ]),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TabPagos extends StatelessWidget {
  const _TabPagos(this.t);
  final Transacciones t;

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Wrap(spacing: 12, runSpacing: 6, children: [
            Etiqueta('Pagos ${dinero(t.totalPagos)}', color: Colors.green.shade700),
            Etiqueta('Efectivo ${dinero(t.efectivo)}', color: Colors.blue.shade700),
            Etiqueta('Transferencia ${dinero(t.transferencia)}', color: Colors.red.shade700),
          ]),
        ),
        Expanded(
          child: t.pagos.isEmpty
              ? const Vacio('No hubo pagos este día')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: t.pagos.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final p = t.pagos[i];
                    return Card(
                      child: ListTile(
                        title: Text(p.cliente.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('Saldo ${miles(p.saldo)} · Pago #${p.numeroPago} · ${p.periodo} · ${horaColombia(p.hora)}'),
                        trailing: Column(mainAxisAlignment: MainAxisAlignment.center, crossAxisAlignment: CrossAxisAlignment.end, children: [
                          Text(miles(p.valor), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                          Text(p.forma, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: p.forma == 'TRANSFERENCIA' ? Colors.red.shade700 : Colors.green.shade800)),
                        ]),
                      ),
                    );
                  },
                ),
        ),
      ]);
}

class _TabCreditos extends StatelessWidget {
  const _TabCreditos(this.t);
  final Transacciones t;

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: Etiqueta('Capital entregado ${dinero(t.totalCreditos)}', color: Colors.blue.shade700)),
        Expanded(
          child: t.creditos.isEmpty
              ? const Vacio('No hubo ventas este día')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: t.creditos.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final k = t.creditos[i];
                    return Card(
                      child: ListTile(
                        title: Text(k.cliente.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('Total ${miles(k.total)} · ${k.cuotas} cuotas de ${miles(k.valorCuota)} · ${k.periodo}'),
                        trailing: Text(miles(k.capital), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      ),
                    );
                  },
                ),
        ),
      ]);
}

class _TabGastos extends StatelessWidget {
  const _TabGastos(this.t);
  final Transacciones t;

  @override
  Widget build(BuildContext context) => Column(children: [
        Padding(padding: const EdgeInsets.all(12), child: Etiqueta('Gastos ${dinero(t.totalGastos)}', color: Colors.red.shade700)),
        Expanded(
          child: t.gastos.isEmpty
              ? const Vacio('No hubo gastos este día')
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                  itemCount: t.gastos.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) {
                    final g = t.gastos[i];
                    return Card(
                      child: ListTile(
                        title: Text(g.tipo, style: const TextStyle(fontWeight: FontWeight.w700)),
                        subtitle: Text('${g.usuario}${g.detalle.isEmpty ? '' : ' · ${g.detalle}'}'),
                        trailing: Text(miles(g.valor), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                      ),
                    );
                  },
                ),
        ),
      ]);
}

class PantallaCierres extends StatefulWidget {
  const PantallaCierres({super.key});

  @override
  State<PantallaCierres> createState() => _PantallaCierresState();
}

class _PantallaCierresState extends State<PantallaCierres> {
  late DateTime _fecha = _hoy(context);
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Cierres',
      hijo: Column(
        children: [
          _BarraFecha(fecha: _fecha, alCambiar: (f) => setState(() => _fecha = f), alActualizar: () => setState(() => _version++)),
          Expanded(
            child: Cargador<Cierre>(
              key: ValueKey('${aFechaIso(_fecha)}-$_version'),
              cargar: () async => Cierre.fromJson(await s.api.get('/api/v1/reportes/cierre', consulta: {'fecha': aFechaIso(_fecha)}) as Json),
              constructor: (context, c, _) => SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 520), child: _TarjetaCierre(c))),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TarjetaCierre extends StatelessWidget {
  const _TarjetaCierre(this.c);
  final Cierre c;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final estado = switch (c.estado) { 'ABIERTO' => ('Abierto', Colors.green.shade700), 'CERRADO' => ('Cerrado', Colors.red.shade700), _ => ('Sin abrir', Colors.grey.shade700) };
    return Card(
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Container(
          color: tema.colorScheme.primary,
          padding: const EdgeInsets.all(14),
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('Base: ${miles(c.base)}', style: TextStyle(color: tema.colorScheme.onPrimary, fontWeight: FontWeight.w800, fontSize: 18)),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            Align(alignment: Alignment.centerRight, child: Etiqueta('Día ${estado.$1}', color: estado.$2)),
            const SizedBox(height: 4),
            FilaDato('Recaudos', miles(c.recaudos), destacado: true),
            FilaDato('   *Efectivo', miles(c.efectivo), color: Colors.green.shade700),
            FilaDato('   *Transferencia', miles(c.transferencia), color: Colors.red.shade700),
            const Divider(),
            FilaDato('Adiciones a la base', miles(c.adiciones)),
            FilaDato('Retiros de la base', miles(c.retiros)),
            FilaDato('Ventas', miles(c.ventas)),
            FilaDato('Gastos', miles(c.gastos), destacado: true),
            const Divider(),
            FilaDato('Total Día', miles(c.totalDia), destacado: true),
            FilaDato('Efectividad Recaudo', c.efectividadRecaudo == null ? '—' : '${decimales(c.efectividadRecaudo!)}%', destacado: true),
            FilaDato('Utilidad Diaria Aprox', miles(c.utilidadDiariaAprox)),
          ]),
        ),
      ]),
    );
  }
}

class PantallaSimulador extends StatefulWidget {
  const PantallaSimulador({super.key});

  @override
  State<PantallaSimulador> createState() => _PantallaSimuladorState();
}

class _PantallaSimuladorState extends State<PantallaSimulador> {
  late final CondicionesCredito _cond = CondicionesCredito(context.read<Sesion>().catalogos!);
  Cronograma? _resultado;

  @override
  void dispose() {
    _cond.dispose();
    super.dispose();
  }

  Future<void> _calcular() async {
    final v = _cond.valorArticulo;
    if (v == null || v < 1) {
      mostrarMensaje(context, 'Escribe el valor del artículo', error: true);
      return;
    }
    try {
      final r = Cronograma.fromJson(await context.read<Sesion>().api.post('/api/v1/simulador', cuerpo: _cond.aJson()) as Json);
      if (mounted) setState(() => _resultado = r);
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cat = context.read<Sesion>().catalogos!;
    final r = _resultado;
    return MarcoPantalla(
      titulo: 'Simulador de crédito',
      hijo: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          FormularioCredito(condiciones: _cond, catalogos: cat),
          const SizedBox(height: 12),
          BotonAccion(texto: 'Calcular', icono: Icons.calculate_outlined, alPulsar: _calcular),
          if (r != null) ...[
            const SizedBox(height: 16),
            Wrap(spacing: 12, runSpacing: 8, children: [
              Etiqueta('Total a pagar ${miles(r.total)}', color: Colors.blue.shade700),
              Etiqueta('Cuota ${miles(r.valorCuota)}', color: Colors.green.shade700),
              Etiqueta('Interés ${miles(r.interes)}', color: Colors.purple.shade700),
              Etiqueta('Vence ${fechaLarga(r.vence)}', color: Colors.orange.shade800),
            ]),
            const SizedBox(height: 12),
            Card(
              child: Table(
                columnWidths: const {0: FixedColumnWidth(56)},
                border: TableBorder(horizontalInside: BorderSide(color: Theme.of(context).dividerColor)),
                children: [
                  TableRow(
                    decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHigh),
                    children: [for (final t in ['Cuota', 'Pagos', 'Saldo', 'Fecha']) Padding(padding: const EdgeInsets.all(8), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700)))],
                  ),
                  for (final c in r.cuotas)
                    TableRow(children: [
                      Padding(padding: const EdgeInsets.all(8), child: Text('${c.numero}')),
                      Padding(padding: const EdgeInsets.all(8), child: Text(miles(c.valor), style: TextStyle(color: Colors.green.shade700, fontWeight: FontWeight.w700))),
                      Padding(padding: const EdgeInsets.all(8), child: Text(miles(c.saldo), style: const TextStyle(fontWeight: FontWeight.w700))),
                      Padding(padding: const EdgeInsets.all(8), child: Text(fechaLarga(c.fecha))),
                    ]),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class PantallaNotas extends StatelessWidget {
  const PantallaNotas({super.key});

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Historial notas',
      hijo: Cargador<List<Nota>>(
        cargar: () async => (await s.api.get('/api/v1/notas') as List).map((e) => Nota.fromJson(e as Json)).toList(),
        constructor: (context, notas, recargar) => notas.isEmpty
            ? const Vacio('Todavía no hay notas', icono: Icons.sticky_note_2_outlined)
            : RefreshIndicator(
                onRefresh: recargar,
                child: ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: notas.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 6),
                  itemBuilder: (_, i) => Card(
                    child: ListTile(
                      title: Text(notas[i].cliente.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text('${notas[i].texto}\n${fechaLarga(notas[i].fecha)} · ${notas[i].usuario}'),
                      isThreeLine: true,
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}
