import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/formato.dart';
import '../estado/sesion.dart';
import '../modelos/modelos.dart';
import '../widgets/comunes.dart';

/// Base de dinero de la cartera. Solo quien tiene el permiso `base.ajustar` ve los botones de ajuste.
class PantallaBase extends StatefulWidget {
  const PantallaBase({super.key});

  @override
  State<PantallaBase> createState() => _PantallaBaseState();
}

class _PantallaBaseState extends State<PantallaBase> {
  int _version = 0;

  Future<void> _ajustar(bool adicion) async {
    final s = context.read<Sesion>();
    final valor = TextEditingController();
    final detalle = TextEditingController();
    final hecho = await mostrarHoja<bool>(
      context,
      titulo: adicion ? 'Adicionar dinero a la base' : 'Retirar dinero de la base',
      liberar: [valor, detalle],
      contenido: (c) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        CampoDinero(controlador: valor, autofoco: true),
        const SizedBox(height: 12),
        TextField(controller: detalle, maxLength: 100, decoration: const InputDecoration(labelText: 'Detalle (opcional)')),
        const SizedBox(height: 4),
        BotonAccion(
          texto: adicion ? 'Adicionar' : 'Retirar',
          icono: adicion ? Icons.add_circle_outline : Icons.remove_circle_outline,
          alPulsar: () async {
            final v = valorEntero(valor.text);
            if (v == null || v < 1) {
              mostrarMensaje(c, 'Escribe el valor', error: true);
              return;
            }
            try {
              await s.api.post('/api/v1/base/movimientos', cuerpo: {'tipo': adicion ? 'ADICION' : 'RETIRO', 'valor': v, if (detalle.text.trim().isNotEmpty) 'detalle': detalle.text.trim()});
              if (c.mounted) Navigator.pop(c, true);
            } catch (e) {
              if (c.mounted) mostrarError(c, e);
            }
          },
        ),
      ]),
    );
    if (hecho == true) {
      if (mounted) mostrarMensaje(context, adicion ? 'Dinero adicionado a la base' : 'Dinero retirado de la base');
      setState(() => _version++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Base',
      hijo: Cargador<ConsultaBase>(
        key: ValueKey(_version),
        cargar: () async => ConsultaBase.fromJson(await s.api.get('/api/v1/base') as Json),
        constructor: (context, b, recargar) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(children: [
                  Text('Valor actual de la base', style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 4),
                  Text(dinero(b.saldo), style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, color: b.saldo < 0 ? Colors.red.shade700 : null)),
                  if (s.puede('base.ajustar')) ...[
                    const SizedBox(height: 16),
                    Wrap(spacing: 12, runSpacing: 8, alignment: WrapAlignment.center, children: [
                      FilledButton.icon(onPressed: () => _ajustar(true), icon: const Icon(Icons.add), label: const Text('Adicionar')),
                      OutlinedButton.icon(onPressed: () => _ajustar(false), icon: const Icon(Icons.remove), label: const Text('Retirar')),
                    ]),
                    if (!(s.dia?.abierto ?? false)) const Padding(padding: EdgeInsets.only(top: 8), child: Text('Abre el día para ajustar la base.', style: TextStyle(fontSize: 12))),
                  ],
                ]),
              ),
            ),
            const SizedBox(height: 12),
            Text('Movimientos', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 4),
            if (b.movimientos.isEmpty)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: Text('Todavía no hay adiciones ni retiros')))
            else
              for (final m in b.movimientos)
                Card(
                  child: ListTile(
                    leading: Icon(m.esAdicion ? Icons.add_circle_outline : Icons.remove_circle_outline, color: m.esAdicion ? Colors.green.shade700 : Colors.red.shade700),
                    title: Text('${m.esAdicion ? '+' : '−'} ${dinero(m.valor)}', style: const TextStyle(fontWeight: FontWeight.w700)),
                    subtitle: Text('${fechaLarga(m.fecha)} · ${m.usuario}${m.detalle.isEmpty ? '' : '\n${m.detalle}'}'),
                    isThreeLine: m.detalle.isNotEmpty,
                  ),
                ),
          ],
        ),
      ),
    );
  }
}

class PantallaUsuarios extends StatefulWidget {
  const PantallaUsuarios({super.key});

  @override
  State<PantallaUsuarios> createState() => _PantallaUsuariosState();
}

class _PantallaUsuariosState extends State<PantallaUsuarios> {
  int _version = 0;

  Future<void> _formulario({UsuarioAdmin? existente}) async {
    final s = context.read<Sesion>();
    final cat = s.catalogos!;
    final nombre = TextEditingController(text: existente?.nombre ?? '');
    final usuario = TextEditingController(text: existente?.usuario ?? '');
    final clave = TextEditingController();
    String rol = existente?.rol ?? 'empleado';
    int? carteraId = existente?.carteraId ?? s.cartera?.id;
    bool activo = existente?.activo ?? true;
    final todasCarteras = (await s.api.get('/api/v1/carteras') as List).map((e) => Cartera.fromJson(e as Json)).toList();
    if (!mounted) return;

    final hecho = await mostrarHoja<bool>(
      context,
      titulo: existente == null ? 'Nuevo usuario' : 'Editar usuario',
      subtitulo: existente?.usuario,
      liberar: [nombre, usuario, clave],
      contenido: (c) => StatefulBuilder(
        builder: (c, setState) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: nombre, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Nombre completo')),
          const SizedBox(height: 12),
          if (existente == null) ...[
            TextField(controller: usuario, decoration: const InputDecoration(labelText: 'Usuario', helperText: '3 a 30 caracteres: letras, números, punto, guion')),
            const SizedBox(height: 12),
          ],
          DropdownButtonFormField<String>(
            initialValue: rol,
            decoration: const InputDecoration(labelText: 'Rol'),
            items: [for (final r in cat.roles) DropdownMenuItem(value: r, child: Text(etiquetaDeRol(r)))],
            onChanged: (v) => setState(() => rol = v ?? rol),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<int?>(
            key: ValueKey('cartera-$rol'),
            initialValue: carteraId,
            decoration: InputDecoration(labelText: rol == 'empleado' ? 'Cartera (obligatoria)' : 'Cartera por defecto (opcional)'),
            items: [
              if (rol != 'empleado') const DropdownMenuItem<int?>(value: null, child: Text('Sin cartera por defecto')),
              for (final k in todasCarteras) DropdownMenuItem<int?>(value: k.id, child: Text(k.nombre + (k.activa ? '' : ' (inactiva)'))),
            ],
            onChanged: (v) => setState(() => carteraId = v),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: clave,
            obscureText: true,
            decoration: InputDecoration(labelText: existente == null ? 'Contraseña' : 'Nueva contraseña (déjala vacía para no cambiarla)', helperText: 'Mínimo 8 caracteres, con letras y números'),
          ),
          if (existente != null) SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Usuario activo'), value: activo, onChanged: (v) => setState(() => activo = v)),
          const SizedBox(height: 8),
          BotonAccion(
            texto: existente == null ? 'Crear usuario' : 'Guardar',
            alPulsar: () async {
              try {
                if (existente == null) {
                  await s.api.post('/api/v1/usuarios', cuerpo: {'usuario': usuario.text.trim(), 'nombre': nombre.text.trim(), 'rol': rol, 'carteraId': carteraId, 'clave': clave.text});
                } else {
                  await s.api.patch('/api/v1/usuarios/${existente.id}', cuerpo: {
                    'nombre': nombre.text.trim(),
                    'rol': rol,
                    'carteraId': carteraId,
                    'activo': activo,
                    if (clave.text.isNotEmpty) 'clave': clave.text,
                  });
                }
                if (c.mounted) Navigator.pop(c, true);
              } catch (e) {
                if (c.mounted) mostrarError(c, e);
              }
            },
          ),
        ]),
      ),
    );
    if (hecho == true) {
      if (mounted) mostrarMensaje(context, existente == null ? 'Usuario creado' : 'Usuario actualizado');
      setState(() => _version++);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Usuarios',
      botonFlotante: FloatingActionButton.extended(onPressed: () => _formulario(), icon: const Icon(Icons.person_add_alt_1), label: const Text('Nuevo usuario')),
      hijo: Cargador<List<UsuarioAdmin>>(
        key: ValueKey(_version),
        cargar: () async => (await s.api.get('/api/v1/usuarios') as List).map((e) => UsuarioAdmin.fromJson(e as Json)).toList(),
        constructor: (context, usuarios, recargar) => RefreshIndicator(
          onRefresh: recargar,
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
            itemCount: usuarios.length,
            separatorBuilder: (_, _) => const SizedBox(height: 6),
            itemBuilder: (_, i) {
              final u = usuarios[i];
              return Card(
                child: ListTile(
                  onTap: () => _formulario(existente: u),
                  leading: CircleAvatar(backgroundColor: u.activo ? null : Theme.of(context).colorScheme.surfaceContainerHighest, child: Text(u.nombre.isEmpty ? '?' : u.nombre[0].toUpperCase())),
                  title: Text(u.nombre, style: TextStyle(fontWeight: FontWeight.w700, decoration: u.activo ? null : TextDecoration.lineThrough)),
                  subtitle: Text('${u.usuario}${u.carteraNombre == null ? '' : ' · ${u.carteraNombre}'}${u.activo ? '' : ' · inactivo'}'),
                  trailing: Etiqueta(etiquetaDeRol(u.rol), color: switch (u.rol) { 'administrador' => Colors.purple.shade700, 'supervisor' => Colors.orange.shade800, _ => Colors.blue.shade700 }),
                ),
              );
            },
          ),
        ),
      ),
    );
  }
}

class PantallaCarteras extends StatefulWidget {
  const PantallaCarteras({super.key});

  @override
  State<PantallaCarteras> createState() => _PantallaCarterasState();
}

class _PantallaCarterasState extends State<PantallaCarteras> {
  int _version = 0;

  Future<void> _formulario({Cartera? existente}) async {
    final s = context.read<Sesion>();
    final nombre = TextEditingController(text: existente?.nombre ?? '');
    bool activa = existente?.activa ?? true;
    final hecho = await mostrarHoja<bool>(
      context,
      titulo: existente == null ? 'Nueva cartera' : 'Editar cartera',
      liberar: [nombre],
      contenido: (c) => StatefulBuilder(
        builder: (c, setState) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(controller: nombre, autofocus: true, decoration: const InputDecoration(labelText: 'Nombre de la cartera')),
          if (existente != null) SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Cartera activa'), value: activa, onChanged: (v) => setState(() => activa = v)),
          const SizedBox(height: 8),
          BotonAccion(
            texto: existente == null ? 'Crear cartera' : 'Guardar',
            alPulsar: () async {
              try {
                if (existente == null) {
                  await s.api.post('/api/v1/carteras', cuerpo: {'nombre': nombre.text.trim()});
                } else {
                  await s.api.patch('/api/v1/carteras/${existente.id}', cuerpo: {'nombre': nombre.text.trim(), 'activa': activa});
                }
                if (c.mounted) Navigator.pop(c, true);
              } catch (e) {
                if (c.mounted) mostrarError(c, e);
              }
            },
          ),
        ]),
      ),
    );
    if (hecho == true) {
      await s.recargarCarteras();
      if (mounted) {
        mostrarMensaje(context, existente == null ? 'Cartera creada' : 'Cartera actualizada');
        setState(() => _version++);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<Sesion>();
    return MarcoPantalla(
      titulo: 'Carteras',
      botonFlotante: FloatingActionButton.extended(onPressed: () => _formulario(), icon: const Icon(Icons.create_new_folder_outlined), label: const Text('Nueva cartera')),
      hijo: Cargador<List<Cartera>>(
        key: ValueKey(_version),
        cargar: () async => (await s.api.get('/api/v1/carteras') as List).map((e) => Cartera.fromJson(e as Json)).toList(),
        constructor: (context, carteras, recargar) => ListView.separated(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 88),
          itemCount: carteras.length,
          separatorBuilder: (_, _) => const SizedBox(height: 6),
          itemBuilder: (_, i) {
            final k = carteras[i];
            return Card(
              child: ListTile(
                onTap: () => _formulario(existente: k),
                leading: const Icon(Icons.folder_shared_outlined),
                title: Text(k.nombre, style: const TextStyle(fontWeight: FontWeight.w700)),
                subtitle: Text('Orden de la ruta: ${k.ordenModo == 'PERSONALIZADO' ? 'personalizado' : 'alfabético'}'),
                trailing: Etiqueta(k.activa ? 'Activa' : 'Inactiva', color: k.activa ? Colors.green.shade700 : Colors.grey.shade700),
              ),
            );
          },
        ),
      ),
    );
  }
}
