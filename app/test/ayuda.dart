import 'dart:convert';
import 'dart:io';

import 'package:financiera_app/app.dart';
import 'package:financiera_app/core/api.dart';
import 'package:financiera_app/estado/sesion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

/// Permisos por rol, generados por el servidor (backend/src/cli/exportar-permisos.ts).
Map<String, List<String>> permisosPorRol() {
  final json = jsonDecode(File('test/fixtures/permisos.json').readAsStringSync()) as Map<String, dynamic>;
  return json.map((rol, lista) => MapEntry(rol, (lista as List).cast<String>()));
}

class PeticionRegistrada {
  PeticionRegistrada(this.metodo, this.ruta, this.cuerpo);
  final String metodo;
  final String ruta;
  final Map<String, dynamic>? cuerpo;
}

/// Servidor simulado que responde con el mismo formato que el backend real.
class ServidorFalso {
  ServidorFalso({this.rol = 'administrador', this.diaAbierto = true});

  String rol;
  bool diaAbierto;
  final peticiones = <PeticionRegistrada>[];
  bool sesionVencida = false;

  late final http.Client cliente = MockClient((r) async {
    final cuerpo = r.body.isEmpty ? null : jsonDecode(r.body) as Map<String, dynamic>;
    peticiones.add(PeticionRegistrada(r.method, r.url.path, cuerpo));
    return _responder(r, cuerpo);
  });

  Map<String, dynamic> get _usuario => {
        'id': 1,
        'usuario': rol,
        'nombre': 'Usuario $rol',
        'rol': rol,
        'carteraId': 1,
        'carteraNombre': 'Norte',
        'activo': true,
        'creadoEn': '2026-10-06T15:00:00.000Z',
      };

  Map<String, dynamic> get perfil => {
        'usuario': _usuario,
        'empresa': {'codigo': 'T1', 'nombre': 'Empresa de prueba'},
        'permisos': permisosPorRol()[rol],
      };

  http.Response _json(Object datos, [int estado = 200]) =>
      http.Response.bytes(utf8.encode(jsonEncode(datos)), estado, headers: {'content-type': 'application/json'});

  http.Response _error(int estado, String codigo, String mensaje) => _json({'error': {'codigo': codigo, 'mensaje': mensaje}}, estado);

  Future<http.Response> _responder(http.BaseRequest r, Map<String, dynamic>? cuerpo) async {
    final ruta = r.url.path;
    if (sesionVencida && ruta != '/api/v1/auth/login') return _error(401, 'NO_AUTENTICADO', 'Sesión inválida o vencida');
    switch ('${r.method} $ruta') {
      case 'POST /api/v1/auth/login':
        if (cuerpo?['contrasena'] != 'Clave1234') return _error(401, 'CREDENCIALES_INVALIDAS', 'Código, usuario o contraseña incorrectos');
        rol = '${cuerpo?['usuario']}';
        return _json({'token': 'token-$rol', ...perfil});
      case 'GET /api/v1/auth/me':
        return _json(perfil);
      case 'GET /api/v1/catalogos':
        return _json({
          'utilidades': [5, 10, 15, 20, 30],
          'cuotas': [1, 4, 10, 20, 24, 30],
          'periodos': ['DIARIO', 'LUNES', 'SABADO', '10 DIAS'],
          'tiposGasto': ['COMBUSTIBLE', 'SALARIO'],
          'formasPago': [],
          'calificaciones': ['BUENO', 'REGULAR', 'MALO'],
          'roles': ['administrador', 'supervisor', 'empleado'],
          'porDefecto': {'utilidad': 20, 'cuotas': 20, 'periodo': 'DIARIO'},
        });
      case 'GET /api/v1/carteras':
        return _json([
          {'id': 1, 'nombre': 'Norte', 'ordenModo': 'ALFABETICO', 'activa': true},
          if (rol != 'empleado') {'id': 2, 'nombre': 'Sur', 'ordenModo': 'ALFABETICO', 'activa': true},
        ]);
      case 'GET /api/v1/dia':
        return _json({'fecha': '2026-10-06', 'estado': diaAbierto ? 'ABIERTO' : 'CERRADO', 'abiertoEn': null, 'cerradoEn': null, 'cierreAutomatico': false});
      case 'POST /api/v1/dia/cerrar':
        diaAbierto = false;
        return _json({'fecha': '2026-10-06', 'estado': 'CERRADO', 'abiertoEn': null, 'cerradoEn': null, 'cierreAutomatico': false});
      case 'POST /api/v1/dia/abrir':
        diaAbierto = true;
        return _json({'fecha': '2026-10-06', 'estado': 'ABIERTO', 'abiertoEn': null, 'cerradoEn': null, 'cierreAutomatico': false});
      case 'GET /api/v1/creditos':
        return _json({
          'creditosVigentes': 1,
          'items': [
            {'id': 9, 'clienteId': 3, 'cliente': 'Ana María Pérez', 'valorCredito': 1200, 'saldo': 1140, 'valorCuota': 60, 'nPagos': 1, 'cuotasPagadas': 1.0, 'periodo': 'DIARIO', 'fecha': '2026-10-05T15:00:00.000Z', 'vence': '2026-11-02', 'ultimoPago': null},
          ],
        });
      case 'POST /api/v1/creditos/9/pagos':
        return _json({'pagoId': 1, 'creditoId': 9, 'valor': cuerpo?['valor'], 'forma': cuerpo?['forma'], 'saldo': 1080, 'cuotasPagadas': 2.0, 'creditoEstado': 'VIGENTE', 'mensaje': 'Pago de CUOTA registrado por valor de ${cuerpo?['valor']}. Su nuevo saldo es de 1080'}, 201);
    }
    return _error(404, 'RUTA_NO_ENCONTRADA', 'Ruta no encontrada: ${r.method} $ruta');
  }
}

Sesion crearSesion(ServidorFalso servidor, {AlmacenMemoria? almacen}) =>
    Sesion(almacen: almacen ?? AlmacenMemoria(), urlPorDefecto: 'http://servidor.test', api: ApiClient(baseUrl: 'http://servidor.test', cliente: servidor.cliente));

Future<void> montarApp(WidgetTester tester, Sesion sesion) async {
  await initializeDateFormatting('es_CO');
  tester.view.physicalSize = const Size(1200, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ChangeNotifierProvider<Sesion>.value(value: sesion, child: const AplicacionFinanciera()));
  await tester.pumpAndSettle();
}

Future<void> iniciarSesion(WidgetTester tester, String usuario, {String clave = 'Clave1234'}) async {
  await tester.enterText(find.widgetWithText(TextField, 'Código'), 'T1');
  await tester.enterText(find.widgetWithText(TextField, 'Usuario'), usuario);
  await tester.enterText(find.widgetWithText(TextField, 'Contraseña'), clave);
  await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
  await tester.pumpAndSettle();
}
