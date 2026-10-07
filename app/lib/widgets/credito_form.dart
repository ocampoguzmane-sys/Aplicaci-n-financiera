import 'package:flutter/material.dart';

import '../core/formato.dart';
import '../modelos/modelos.dart';
import 'comunes.dart';

/// Condiciones de un crédito: valor del artículo, utilidad, cuotas y periodo.
class CondicionesCredito {
  CondicionesCredito(Catalogos c)
      : valor = TextEditingController(),
        utilidad = c.utilidadPorDefecto,
        cuotas = c.cuotasPorDefecto,
        periodo = c.periodoPorDefecto;

  final TextEditingController valor;
  int utilidad;
  int cuotas;
  String periodo;

  int? get valorArticulo => valorEntero(valor.text);

  Map<String, Object> aJson() => {'valorArticulo': valorArticulo ?? 0, 'utilidad': utilidad, 'cuotas': cuotas, 'periodo': periodo};

  void dispose() => valor.dispose();
}

class FormularioCredito extends StatefulWidget {
  const FormularioCredito({super.key, required this.condiciones, required this.catalogos, this.etiquetaValor = 'Valor del artículo'});
  final CondicionesCredito condiciones;
  final Catalogos catalogos;
  final String etiquetaValor;

  @override
  State<FormularioCredito> createState() => _FormularioCreditoState();
}

class _FormularioCreditoState extends State<FormularioCredito> {
  @override
  Widget build(BuildContext context) {
    final c = widget.condiciones;
    final cat = widget.catalogos;
    Widget lista<T>(String etiqueta, T valor, List<T> opciones, ValueChanged<T> alCambiar, {Color? color}) => DropdownButtonFormField<T>(
          key: ValueKey('$etiqueta-$valor'),
          initialValue: valor,
          isExpanded: true,
          decoration: InputDecoration(labelText: etiqueta, border: const OutlineInputBorder()),
          style: TextStyle(color: color ?? Theme.of(context).colorScheme.onSurface, fontWeight: FontWeight.w600),
          items: [for (final o in opciones) DropdownMenuItem(value: o, child: Text('$o'))],
          onChanged: (v) {
            if (v != null) setState(() => alCambiar(v));
          },
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CampoDinero(controlador: c.valor, etiqueta: widget.etiquetaValor),
        const SizedBox(height: 12),
        LayoutBuilder(builder: (context, caja) {
          final campos = [
            lista<int>('Utilidad (%)', c.utilidad, cat.utilidades, (v) => c.utilidad = v, color: Colors.blue.shade700),
            lista<int>('Cuotas', c.cuotas, cat.cuotas, (v) => c.cuotas = v, color: Colors.red.shade700),
            lista<String>('Periodo', c.periodo, cat.periodos, (v) => c.periodo = v, color: Colors.green.shade800),
          ];
          if (caja.maxWidth < 420) {
            return Column(children: [for (final f in campos) Padding(padding: const EdgeInsets.only(bottom: 12), child: f)]);
          }
          return Row(children: [
            for (var i = 0; i < campos.length; i++) ...[if (i > 0) const SizedBox(width: 12), Expanded(child: campos[i])],
          ]);
        }),
      ],
    );
  }
}
