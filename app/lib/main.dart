import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'estado/sesion.dart';

/// Dirección del servidor. Se puede fijar al compilar:
///   flutter run --dart-define=API_URL=https://api.miempresa.com
/// (en el emulador de Android, el equipo anfitrión es http://10.0.2.2:3000).
///
/// En la versión web, la app y el servidor se entregan desde la misma dirección, así que se usa
/// la del navegador (no hace falta configurar nada). Para probar la web con `flutter run -d chrome`
/// contra otro puerto, indica API_URL.
const String _urlCompilada = String.fromEnvironment('API_URL');
final String urlPorDefecto = _urlCompilada.isNotEmpty ? _urlCompilada : (kIsWeb ? Uri.base.origin : 'http://localhost:3000');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es_CO');
  final sesion = Sesion(almacen: const AlmacenSeguro(), urlPorDefecto: urlPorDefecto);
  runApp(ChangeNotifierProvider.value(value: sesion, child: const AplicacionFinanciera()));
  sesion.restaurar();
}
