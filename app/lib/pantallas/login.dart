import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../estado/sesion.dart';

class PantallaLogin extends StatefulWidget {
  const PantallaLogin({super.key});

  @override
  State<PantallaLogin> createState() => _PantallaLoginState();
}

class _PantallaLoginState extends State<PantallaLogin> {
  final _codigo = TextEditingController();
  final _usuario = TextEditingController();
  final _clave = TextEditingController();
  late final TextEditingController _url;
  bool _ver = false;
  bool _servidor = false;
  bool _ocupado = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _url = TextEditingController(text: context.read<Sesion>().urlServidor);
  }

  @override
  void dispose() {
    _codigo.dispose();
    _usuario.dispose();
    _clave.dispose();
    _url.dispose();
    super.dispose();
  }

  Future<void> _entrar() async {
    if (_codigo.text.trim().isEmpty ||
        _usuario.text.trim().isEmpty ||
        _clave.text.isEmpty) {
      setState(() => _error = 'Escribe el código, el usuario y la contraseña.');
      return;
    }
    setState(() {
      _ocupado = true;
      _error = null;
    });
    try {
      await context.read<Sesion>().iniciar(
        codigo: _codigo.text,
        usuario: _usuario.text,
        clave: _clave.text,
        url: _url.text,
      );
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _ocupado = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final aviso = context.select<Sesion, String?>((s) => s.aviso);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Icon(
                      Icons.account_balance_wallet_outlined,
                      size: 56,
                      color: tema.colorScheme.primary,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      'Financiera',
                      textAlign: TextAlign.center,
                      style: tema.textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Ingresa tus credenciales para acceder',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: tema.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 28),
                    if (aviso != null) ...[
                      Card(
                        color: tema.colorScheme.tertiaryContainer,
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Text(aviso),
                        ),
                      ),
                      const SizedBox(height: 12),
                    ],
                    TextField(
                      controller: _codigo,
                      keyboardType: TextInputType.text,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(
                        labelText: 'Código',
                        prefixIcon: Icon(Icons.business_outlined),
                      ),
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp(r'[A-Za-z0-9._-]'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _usuario,
                      textInputAction: TextInputAction.next,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(
                        labelText: 'Usuario',
                        prefixIcon: Icon(Icons.person_outline),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _clave,
                      obscureText: !_ver,
                      autofillHints: const [AutofillHints.password],
                      onSubmitted: (_) => _entrar(),
                      decoration: InputDecoration(
                        labelText: 'Contraseña',
                        prefixIcon: const Icon(Icons.lock_outline),
                        suffixIcon: IconButton(
                          tooltip: _ver
                              ? 'Ocultar contraseña'
                              : 'Mostrar contraseña',
                          icon: Icon(
                            _ver ? Icons.visibility_off : Icons.visibility,
                          ),
                          onPressed: () => setState(() => _ver = !_ver),
                        ),
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(
                        _error!,
                        style: TextStyle(color: tema.colorScheme.error),
                        textAlign: TextAlign.center,
                      ),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _ocupado ? null : _entrar,
                      child: _ocupado
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            )
                          : const Text('Ingresar'),
                    ),
                    const SizedBox(height: 8),
                    if (!kIsWeb)
                      TextButton.icon(
                        onPressed: () => setState(() => _servidor = !_servidor),
                        icon: Icon(
                          _servidor ? Icons.expand_less : Icons.dns_outlined,
                          size: 18,
                        ),
                        label: const Text('Servidor'),
                      ),
                    if (_servidor && !kIsWeb)
                      TextField(
                        controller: _url,
                        keyboardType: TextInputType.url,
                        decoration: const InputDecoration(
                          labelText: 'Dirección del servidor',
                          helperText: 'Ejemplo: https://api.miempresa.com',
                        ),
                      ),
                    const SizedBox(height: 16),
                    Text(
                      'V. 1.0.0',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        color: tema.colorScheme.outline,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
