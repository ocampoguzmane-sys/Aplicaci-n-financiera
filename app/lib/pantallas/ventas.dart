import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';
import '../widgets/credito_form.dart';

/// Abre el formulario de una venta (crédito) para un cliente. Devuelve `true` si se registró.
Future<bool> mostrarVenta(BuildContext context, ResumenCliente cliente) async {
  final s = context.read<Sesion>();
  final cat = s.catalogos!;
  final cond = CondicionesCredito(cat);
  final hecho = await mostrarHoja<bool>(
    context,
    titulo: 'Registrar venta',
    subtitulo: cliente.nombre.toUpperCase(),
    liberar: [cond.valor],
    contenido: (c) => Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(children: [
          Etiqueta(cliente.calificacion, color: colorCalificacion(cliente.calificacion)),
          const SizedBox(width: 8),
          Icon(Icons.phone_android, size: 16, color: Theme.of(c).colorScheme.outline),
          const SizedBox(width: 4),
          Text(cliente.telefono),
          const SizedBox(width: 12),
          Flexible(child: Text(cliente.barrio, overflow: TextOverflow.ellipsis)),
        ]),
        const SizedBox(height: 16),
        FormularioCredito(condiciones: cond, catalogos: cat),
        const SizedBox(height: 16),
        BotonAccion(
          texto: 'Registrar Venta',
          icono: Icons.check_circle_outline,
          alPulsar: () async {
            final valor = cond.valorArticulo;
            if (valor == null || valor < 1) {
              mostrarMensaje(c, 'Escribe el valor del artículo', error: true);
              return;
            }
            try {
              await s.api.post('/api/v1/clientes/${cliente.id}/creditos', cuerpo: cond.aJson());
              if (c.mounted) Navigator.pop(c, true);
              if (context.mounted) mostrarMensaje(context, 'Venta registrada');
            } catch (e) {
              if (c.mounted) mostrarError(c, e);
            }
          },
        ),
      ],
    ),
  );
  return hecho ?? false;
}

class PantallaVentas extends StatefulWidget {
  const PantallaVentas({super.key});

  @override
  State<PantallaVentas> createState() => _PantallaVentasState();
}

class _PantallaVentasState extends State<PantallaVentas> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Registrar Ventas',
      hijo: Column(
        children: [
          Padding(padding: const EdgeInsets.fromLTRB(12, 12, 12, 4), child: CampoBusqueda(alCambiar: (t) => setState(() => _q = t), sugerencia: 'Buscar cliente')),
          Expanded(
            child: Cargador<ListaClientes>(
              key: ValueKey(_q),
              cargar: () async => ListaClientes.fromJson(await s.api.get('/api/v1/clientes', consulta: {'q': _q}) as Json),
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
                        ? const Vacio('No hay clientes')
                        : RefreshIndicator(
                            onRefresh: recargar,
                            child: ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: datos.items.length,
                              separatorBuilder: (_, _) => const SizedBox(height: 8),
                              itemBuilder: (_, i) {
                                final c = datos.items[i];
                                return Card(
                                  child: ListTile(
                                    title: Text(c.nombre.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.w700)),
                                    subtitle: Text('Vigentes: ${c.vigentes}  ·  Pagados: ${c.pagados}\n${c.barrio}'),
                                    isThreeLine: true,
                                    leading: Icon(Icons.circle, size: 12, color: colorCalificacion(c.calificacion)),
                                    trailing: FilledButton.icon(
                                      onPressed: () async {
                                        if (await mostrarVenta(context, c)) await recargar();
                                      },
                                      icon: const Icon(Icons.point_of_sale, size: 18),
                                      label: const Text('Vender'),
                                    ),
                                  ),
                                );
                              },
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
