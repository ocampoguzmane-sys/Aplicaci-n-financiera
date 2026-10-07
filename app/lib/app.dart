import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'estado/sesion.dart';
import 'pantallas/inicio.dart';
import 'pantallas/login.dart';

class AplicacionFinanciera extends StatelessWidget {
  const AplicacionFinanciera({super.key});

  @override
  Widget build(BuildContext context) {
    final esquema = ColorScheme.fromSeed(seedColor: const Color(0xFF3B6FB6));
    return MaterialApp(
      title: 'Financiera',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: esquema,
        useMaterial3: true,
        appBarTheme: AppBarTheme(backgroundColor: esquema.primary, foregroundColor: esquema.onPrimary),
        cardTheme: const CardThemeData(margin: EdgeInsets.zero),
        inputDecorationTheme: const InputDecorationTheme(border: OutlineInputBorder()),
      ),
      locale: const Locale('es', 'CO'),
      supportedLocales: const [Locale('es', 'CO'), Locale('es')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: const _Raiz(),
    );
  }
}

/// Muestra el login o el inicio según haya o no sesión.
class _Raiz extends StatelessWidget {
  const _Raiz();

  @override
  Widget build(BuildContext context) {
    final estado = context.select<Sesion, EstadoSesion>((s) => s.estado);
    return switch (estado) {
      EstadoSesion.iniciando => const Scaffold(body: Center(child: CircularProgressIndicator())),
      EstadoSesion.sinSesion => const PantallaLogin(),
      EstadoSesion.activa => const PantallaInicio(),
    };
  }
}
