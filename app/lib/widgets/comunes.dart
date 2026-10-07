import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';

/// Ancho máximo del contenido: en escritorio y tablet no se estira a toda la pantalla.
const double anchoMaximo = 900;

/// Marco común de las pantallas: título, cartera actual y contenido centrado.
class MarcoPantalla extends StatelessWidget {
  const MarcoPantalla({super.key, required this.titulo, required this.hijo, this.acciones, this.botonFlotante});

  final String titulo;
  final Widget hijo;
  final List<Widget>? acciones;
  final Widget? botonFlotante;

  @override
  Widget build(BuildContext context) {
    final cartera = context.watch<Sesion>().cartera?.nombre;
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(titulo, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            if (cartera != null) Text(cartera.toUpperCase(), style: const TextStyle(fontSize: 11, letterSpacing: 1)),
          ],
        ),
        actions: acciones,
      ),
      floatingActionButton: botonFlotante,
      body: SafeArea(
        child: Align(
          alignment: Alignment.topCenter,
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: anchoMaximo), child: hijo),
        ),
      ),
    );
  }
}

void mostrarMensaje(BuildContext context, String texto, {bool error = false}) {
  final tema = Theme.of(context);
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: error ? tema.colorScheme.error : null,
      behavior: SnackBarBehavior.floating,
    ));
}

void mostrarError(BuildContext context, Object error) => mostrarMensaje(context, '$error', error: true);

Future<bool> confirmar(BuildContext context, String titulo, String mensaje, {String aceptar = 'Confirmar'}) async {
  final r = await showDialog<bool>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(titulo),
      content: Text(mensaje),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(c, true), child: Text(aceptar)),
      ],
    ),
  );
  return r ?? false;
}

/// Carga datos de forma asíncrona, con indicador, mensaje de error y reintento.
class Cargador<T> extends StatefulWidget {
  const Cargador({super.key, required this.cargar, required this.constructor});

  final Future<T> Function() cargar;
  final Widget Function(BuildContext context, T datos, Future<void> Function() recargar) constructor;

  @override
  State<Cargador<T>> createState() => _CargadorState<T>();
}

class _CargadorState<T> extends State<Cargador<T>> {
  T? _datos;
  Object? _error;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _recargar();
  }

  Future<void> _recargar() async {
    if (_datos == null) setState(() => _cargando = true);
    try {
      final d = await widget.cargar();
      if (!mounted) return;
      setState(() {
        _datos = d;
        _error = null;
        _cargando = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_cargando) return const Center(child: CircularProgressIndicator());
    if (_datos == null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off, size: 48, color: Theme.of(context).colorScheme.outline),
              const SizedBox(height: 12),
              Text('${_error ?? 'No se pudo cargar'}', textAlign: TextAlign.center),
              const SizedBox(height: 12),
              OutlinedButton.icon(onPressed: _recargar, icon: const Icon(Icons.refresh), label: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }
    return widget.constructor(context, _datos as T, _recargar);
  }
}

class Vacio extends StatelessWidget {
  const Vacio(this.texto, {super.key, this.icono = Icons.inbox_outlined});
  final String texto;
  final IconData icono;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icono, size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: 8),
            Text(texto, textAlign: TextAlign.center, style: TextStyle(color: Theme.of(context).colorScheme.outline)),
          ]),
        ),
      );
}

/// Campo de búsqueda que espera un instante antes de avisar, para no consultar en cada tecla.
class CampoBusqueda extends StatefulWidget {
  const CampoBusqueda({super.key, required this.alCambiar, this.sugerencia = 'Buscar'});
  final ValueChanged<String> alCambiar;
  final String sugerencia;

  @override
  State<CampoBusqueda> createState() => _CampoBusquedaState();
}

class _CampoBusquedaState extends State<CampoBusqueda> {
  Timer? _espera;

  @override
  void dispose() {
    _espera?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(
        decoration: InputDecoration(
          prefixIcon: const Icon(Icons.search),
          hintText: widget.sugerencia,
          isDense: true,
          border: const OutlineInputBorder(),
        ),
        onChanged: (t) {
          _espera?.cancel();
          _espera = Timer(const Duration(milliseconds: 350), () => widget.alCambiar(t));
        },
      );
}

class CampoDinero extends StatelessWidget {
  const CampoDinero({super.key, required this.controlador, this.etiqueta = 'Valor', this.autofoco = false, this.alEnviar});
  final TextEditingController controlador;
  final String etiqueta;
  final bool autofoco;
  final ValueChanged<String>? alEnviar;

  @override
  Widget build(BuildContext context) => TextField(
        controller: controlador,
        autofocus: autofoco,
        keyboardType: TextInputType.number,
        inputFormatters: const [FormatoMiles()],
        onSubmitted: alEnviar,
        decoration: InputDecoration(labelText: etiqueta, prefixText: r'$ ', border: const OutlineInputBorder()),
      );
}

class FilaDato extends StatelessWidget {
  const FilaDato(this.etiqueta, this.valor, {super.key, this.destacado = false, this.color});
  final String etiqueta;
  final String valor;
  final bool destacado;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final estilo = TextStyle(fontWeight: destacado ? FontWeight.w700 : FontWeight.w500, color: color);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: Text(etiqueta, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant))),
          const SizedBox(width: 12),
          Flexible(child: Text(valor, textAlign: TextAlign.end, style: estilo)),
        ],
      ),
    );
  }
}

class Etiqueta extends StatelessWidget {
  const Etiqueta(this.texto, {super.key, this.color});
  final String texto;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Theme.of(context).colorScheme.primary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(6)),
      child: Text(texto, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: c)),
    );
  }
}

Color colorCalificacion(String calificacion) => switch (calificacion) {
      'BUENO' => Colors.green.shade700,
      'REGULAR' => Colors.orange.shade800,
      _ => Colors.red.shade700,
    };

/// Botón que se bloquea mientras la operación está en curso, para evitar envíos dobles.
class BotonAccion extends StatefulWidget {
  const BotonAccion({super.key, required this.texto, required this.alPulsar, this.icono, this.tonal = false});
  final String texto;
  final Future<void> Function() alPulsar;
  final IconData? icono;
  final bool tonal;

  @override
  State<BotonAccion> createState() => _BotonAccionState();
}

class _BotonAccionState extends State<BotonAccion> {
  bool _ocupado = false;

  Future<void> _pulsar() async {
    setState(() => _ocupado = true);
    try {
      await widget.alPulsar();
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final contenido = _ocupado
        ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
        : Row(mainAxisSize: MainAxisSize.min, children: [
            if (widget.icono != null) ...[Icon(widget.icono, size: 18), const SizedBox(width: 8)],
            // En pantallas estrechas el texto se reduce en vez de desbordar el botón.
            Flexible(child: FittedBox(fit: BoxFit.scaleDown, child: Text(widget.texto, maxLines: 1))),
          ]);
    final alPulsar = _ocupado ? null : _pulsar;
    return widget.tonal
        ? FilledButton.tonal(onPressed: alPulsar, child: contenido)
        : FilledButton(onPressed: alPulsar, child: contenido);
  }
}

/// Libera los controladores cuando este widget sale del árbol, es decir, al terminar la animación
/// de cierre de la hoja o el diálogo. Liberarlos antes (justo al volver del `await`) los dejaría
/// en uso mientras la pantalla todavía se está cerrando.
class Liberar extends StatefulWidget {
  const Liberar({super.key, required this.controladores, required this.hijo});
  final List<ChangeNotifier> controladores;
  final Widget hijo;

  @override
  State<Liberar> createState() => _LiberarState();
}

class _LiberarState extends State<Liberar> {
  @override
  void dispose() {
    for (final c in widget.controladores) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.hijo;
}

/// Diálogo cuyos controladores de texto se liberan al cerrarse (ver [Liberar]).
Future<T?> mostrarDialogo<T>(BuildContext context, {List<ChangeNotifier> liberar = const [], required WidgetBuilder builder}) =>
    showDialog<T>(context: context, builder: (c) => Liberar(controladores: liberar, hijo: builder(c)));

/// Hoja inferior de formulario con teclado, adaptada a pantallas pequeñas.
Future<T?> mostrarHoja<T>(BuildContext context,
    {required String titulo, String? subtitulo, List<ChangeNotifier> liberar = const [], required Widget Function(BuildContext) contenido}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: 560),
    builder: (c) => Padding(
      padding: EdgeInsets.fromLTRB(20, 4, 20, MediaQuery.of(c).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(titulo, style: Theme.of(c).textTheme.titleLarge),
            if (subtitulo != null) Text(subtitulo, style: TextStyle(color: Theme.of(c).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 16),
            Liberar(controladores: liberar, hijo: contenido(c)),
          ],
        ),
      ),
    ),
  );
}

Future<DateTime?> elegirFecha(BuildContext context, DateTime inicial, {DateTime? maxima}) => showDatePicker(
      context: context,
      initialDate: inicial,
      firstDate: DateTime(2020),
      lastDate: maxima ?? DateTime.now().add(const Duration(days: 1)),
      locale: const Locale('es', 'CO'),
    );

String textoFecha(DateTime d) => fechaLarga(aFechaIso(d));
