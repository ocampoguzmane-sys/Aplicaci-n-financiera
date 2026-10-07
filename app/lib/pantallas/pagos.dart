import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';

class PantallaPagos extends StatefulWidget {
  const PantallaPagos({super.key});

  @override
  State<PantallaPagos> createState() => _PantallaPagosState();
}

class _PantallaPagosState extends State<PantallaPagos> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Registrar Pagos',
      hijo: Column(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 4), child: CampoBusqueda(alCambiar: (t) => setState(() => _q = t), sugerencia: 'Buscar cliente')),
          Expanded(
            child: Cargador<ListaCreditos>(
              key: ValueKey(_q),
              cargar: () async => ListaCreditos.fromJson(await s.api.get('/api/v1/creditos', consulta: {'q': _q}) as Json),
              constructor: (context, datos, recargar) => Column(
                children: [
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                    child: Row(children: [
                      const Text('Créditos vigentes: '),
                      Etiqueta('${datos.creditosVigentes}', color: Colors.blue.shade700),
                    ]),
                  ),
                  Expanded(
                    child: datos.items.isEmpty
                        ? const Vacio('No hay créditos vigentes')
                        : RefreshIndicator(
                            onRefresh: recargar,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: datos.items.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (_, i) => _TarjetaCredito(credito: datos.items[i], recargar: recargar),
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

class _TarjetaCredito extends StatelessWidget {
  const _TarjetaCredito({required this.credito, required this.recargar});
  final CreditoVigente credito;
  final Future<void> Function() recargar;

  @override
  Widget build(BuildContext context) {
    final c = credito;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(c.cliente.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 4),
                  Text.rich(TextSpan(children: [
                    const TextSpan(text: 'Valor crédito: '),
                    TextSpan(text: miles(c.valorCredito), style: TextStyle(fontWeight: FontWeight.w700, color: Colors.red.shade700)),
                  ])),
                  Text.rich(TextSpan(children: [
                    const TextSpan(text: 'Saldo: '),
                    TextSpan(text: miles(c.saldo), style: TextStyle(fontWeight: FontWeight.w700, color: Colors.green.shade700)),
                  ])),
                  Text('# Pagos: ${c.nPagos}   ·   Cuotas pagadas: ${decimales(c.cuotasPagadas)}', style: const TextStyle(fontSize: 13)),
                  const SizedBox(height: 4),
                  Row(children: [
                    Etiqueta(c.periodo, color: Colors.green.shade800),
                    if (c.ultimoPago != null) ...[
                      const SizedBox(width: 8),
                      Text('Último: ${fechaHoraColombia(c.ultimoPago!)}', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.outline)),
                    ],
                  ]),
                ],
              ),
            ),
            const SizedBox(width: 8),
            IntrinsicWidth(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  FilledButton.icon(onPressed: () => _pagar(context), icon: const Icon(Icons.payments, size: 18), label: const Text('Pagar')),
                  const SizedBox(height: 6),
                  OutlinedButton.icon(
                    onPressed: () async {
                      await mostrarInformeCredito(context, c.id);
                      await recargar();
                    },
                    icon: const Icon(Icons.list_alt, size: 18),
                    label: const Text('Ver'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pagar(BuildContext context) async {
    final s = context.read<Sesion>();
    final valor = TextEditingController(text: miles(credito.valorCuota < credito.saldo ? credito.valorCuota : credito.saldo));
    final nota = TextEditingController();
    final hecho = await mostrarHoja<bool>(
      context,
      titulo: 'Abonar cuota · crédito ${credito.id}',
      subtitulo: credito.cliente.toUpperCase(),
      liberar: [valor, nota],
      contenido: (c) {
        Future<void> enviar(String forma) async {
          final v = valorEntero(valor.text);
          if (v == null || v < 1) {
            mostrarMensaje(c, 'Escribe el valor del pago', error: true);
            return;
          }
          try {
            final r = ResultadoPago.fromJson(await s.api.post('/api/v1/creditos/${credito.id}/pagos', cuerpo: {
              'valor': v,
              'forma': forma,
              if (nota.text.trim().isNotEmpty) 'nota': nota.text.trim(),
            }) as Json);
            if (c.mounted) Navigator.pop(c, true);
            if (context.mounted) mostrarMensaje(context, 'Pago de ${dinero(v)} registrado. Nuevo saldo: ${dinero(r.saldo)}');
          } catch (e) {
            if (c.mounted) mostrarError(c, e);
          }
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              color: Theme.of(c).colorScheme.surfaceContainerLow,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(children: [
                  FilaDato('Valor venta', miles(credito.valorCredito), destacado: true),
                  FilaDato('Saldo actual', miles(credito.saldo)),
                  FilaDato('Valor cuota', miles(credito.valorCuota), destacado: true),
                  FilaDato('# Pagos', '${credito.nPagos}'),
                  FilaDato('Cuotas pagadas', decimales(credito.cuotasPagadas), destacado: true),
                ]),
              ),
            ),
            const SizedBox(height: 12),
            CampoDinero(controlador: valor, autofoco: true),
            const SizedBox(height: 12),
            TextField(controller: nota, maxLength: 200, decoration: const InputDecoration(labelText: 'Nota (opcional)')),
            const SizedBox(height: 4),
            Row(children: [
              Expanded(child: BotonAccion(texto: 'Transferencia', icono: Icons.swap_horiz, tonal: true, alPulsar: () => enviar('TR'))),
              const SizedBox(width: 12),
              Expanded(child: BotonAccion(texto: 'Efectivo', icono: Icons.payments_outlined, alPulsar: () => enviar('EF'))),
            ]),
          ],
        );
      },
    );
    if (hecho == true) await recargar();
  }
}

/// Informe de crédito: condiciones, saldo y pagos. Quien puede editar pagos los modifica o anula aquí.
Future<void> mostrarInformeCredito(BuildContext context, int creditoId) => showDialog<void>(
      context: context,
      builder: (_) => Dialog(
        insetPadding: const EdgeInsets.all(12),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 620, maxHeight: 720),
          child: _InformeCredito(creditoId: creditoId),
        ),
      ),
    );

class _InformeCredito extends StatefulWidget {
  const _InformeCredito({required this.creditoId});
  final int creditoId;

  @override
  State<_InformeCredito> createState() => _InformeCreditoState();
}

class _InformeCreditoState extends State<_InformeCredito> {
  int _version = 0;

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return Cargador<InformeCredito>(
      key: ValueKey(_version),
      cargar: () async => InformeCredito.fromJson(await s.api.get('/api/v1/creditos/${widget.creditoId}') as Json),
      constructor: (context, r, _) {
        final hoy = s.dia?.fecha;
        final puedeEditar = s.puede('pagos.editar') && (s.dia?.abierto ?? false);
        return Column(
          children: [
            ListTile(
              title: Text('Informe de crédito ${r.id}', style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${r.cliente.toUpperCase()}\n${fechaHoraColombia(r.creadoEn)}'),
              isThreeLine: true,
              trailing: IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _Rejilla([
                    ('Capital', miles(r.capital)),
                    ('Intereses', miles(r.intereses)),
                    ('Tasa', '${r.tasa}%'),
                    ('Cuotas', '${r.cuotas}'),
                    ('Valor cuota', miles(r.valorCuota)),
                    ('Valor total', miles(r.valorTotal)),
                    ('Vence', fechaLarga(r.vence)),
                    ('Periodo', r.periodo),
                  ], Theme.of(context).colorScheme.primaryContainer.withValues(alpha: 0.45)),
                  const SizedBox(height: 10),
                  _Rejilla([
                    ('Saldo', miles(r.saldo)),
                    ('Total abonos', miles(r.totalAbonos)),
                    ('# Pagos', '${r.nPagos}'),
                    ('Cuotas pagadas (aprox.)', decimales(r.cuotasPagadas)),
                  ], Colors.green.withValues(alpha: 0.10)),
                  const SizedBox(height: 14),
                  if (r.pagos.isEmpty)
                    const Padding(padding: EdgeInsets.all(16), child: Center(child: Text('Todavía no hay pagos')))
                  else
                    Table(
                      columnWidths: const {0: FixedColumnWidth(40), 4: FlexColumnWidth(1.2)},
                      border: TableBorder(horizontalInside: BorderSide(color: Theme.of(context).dividerColor)),
                      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                      children: [
                        TableRow(
                          decoration: BoxDecoration(color: Theme.of(context).colorScheme.surfaceContainerHigh),
                          children: [for (final t in ['#', 'Valor', 'Fecha', 'Forma', 'Saldo', '']) Padding(padding: const EdgeInsets.all(8), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w700)))],
                        ),
                        for (final p in r.pagos)
                          TableRow(children: [
                            Padding(padding: const EdgeInsets.all(8), child: Text('${p.item}')),
                            Padding(padding: const EdgeInsets.all(8), child: Text(miles(p.valor) + (p.modificado ? ' *' : ''))),
                            Padding(padding: const EdgeInsets.all(8), child: Text(fechaLarga(p.fecha))),
                            Padding(padding: const EdgeInsets.all(8), child: Text(p.forma, style: TextStyle(color: p.forma == 'TR' ? Colors.red.shade700 : Colors.green.shade800, fontWeight: FontWeight.w700))),
                            Padding(padding: const EdgeInsets.all(8), child: Text(miles(p.saldo))),
                            if (puedeEditar && p.fecha == hoy)
                              Row(mainAxisSize: MainAxisSize.min, children: [
                                IconButton(visualDensity: VisualDensity.compact, tooltip: 'Editar pago', icon: const Icon(Icons.edit_outlined, size: 18), onPressed: () => _editar(p)),
                                IconButton(visualDensity: VisualDensity.compact, tooltip: 'Anular pago', icon: Icon(Icons.delete_outline, size: 18, color: Colors.red.shade700), onPressed: () => _anular(p)),
                              ])
                            else
                              const SizedBox.shrink(),
                          ]),
                      ],
                    ),
                  if (r.pagos.any((p) => p.modificado)) const Padding(padding: EdgeInsets.only(top: 6), child: Text('* pago modificado', style: TextStyle(fontSize: 12))),
                ],
              ),
            ),
          ],
        );
      },
    );
  }

  Future<void> _editar(PagoInforme p) async {
    final s = context.read<Sesion>();
    final valor = TextEditingController(text: miles(p.valor));
    String forma = p.forma;
    final cambio = await mostrarDialogo<bool>(
      context,
      liberar: [valor],
      builder: (c) => StatefulBuilder(
        builder: (c, setState) => AlertDialog(
          title: Text('Editar pago #${p.item}'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            CampoDinero(controlador: valor, autofoco: true),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [ButtonSegment(value: 'EF', label: Text('Efectivo')), ButtonSegment(value: 'TR', label: Text('Transferencia'))],
              selected: {forma},
              onSelectionChanged: (v) => setState(() => forma = v.first),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
            FilledButton(
              onPressed: () async {
                final v = valorEntero(valor.text);
                if (v == null || v < 1) return;
                try {
                  await s.api.patch('/api/v1/pagos/${p.id}', cuerpo: {'valor': v, 'forma': forma});
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
    if (cambio == true) {
      if (mounted) mostrarMensaje(context, 'Pago modificado');
      setState(() => _version++);
    }
  }

  Future<void> _anular(PagoInforme p) async {
    final s = context.read<Sesion>();
    if (!await confirmar(context, 'Anular pago', 'Se anulará el pago #${p.item} por ${dinero(p.valor)}. El saldo del crédito se recalculará.', aceptar: 'Anular')) return;
    try {
      await s.api.delete('/api/v1/pagos/${p.id}');
      if (mounted) mostrarMensaje(context, 'Pago anulado');
      setState(() => _version++);
    } catch (e) {
      if (mounted) mostrarError(context, e);
    }
  }
}

class _Rejilla extends StatelessWidget {
  const _Rejilla(this.datos, this.fondo);
  final List<(String, String)> datos;
  final Color fondo;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: fondo, borderRadius: BorderRadius.circular(8)),
        child: Wrap(
          runSpacing: 6,
          children: [
            for (final d in datos)
              FractionallySizedBox(
                widthFactor: 0.5,
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(d.$1, style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    Text(d.$2, style: const TextStyle(fontWeight: FontWeight.w700)),
                  ]),
                ),
              ),
          ],
        ),
      );
}
