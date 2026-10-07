import 'dart:convert';

import 'package:financiera_app/core/api.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Respuesta en UTF-8, como la envía el servidor real (http.Response(String) usaría Latin-1).
http.Response _utf8(Object cuerpo, int estado) =>
    http.Response.bytes(utf8.encode(jsonEncode(cuerpo)), estado, headers: {'content-type': 'application/json; charset=utf-8'});

void main() {
  late List<http.Request> vistas;
  late ApiClient api;

  setUp(() {
    vistas = [];
    api = ApiClient(
      baseUrl: 'http://servidor.test/',
      cliente: MockClient((r) async {
        vistas.add(r);
        return http.Response(jsonEncode({'ok': true}), 200, headers: {'content-type': 'application/json'});
      }),
    );
  });

  test('una petición sin cuerpo no envía content-type (el servidor rechaza JSON vacío)', () async {
    await api.post('/api/v1/dia/abrir');
    expect(vistas.single.headers.containsKey('content-type'), isFalse);
    expect(vistas.single.body, isEmpty);
  });

  test('una petición con cuerpo lo envía como JSON', () async {
    await api.post('/api/v1/gastos', cuerpo: {'valor': 5});
    expect(vistas.single.headers['content-type'], contains('application/json'));
    expect(jsonDecode(vistas.single.body), {'valor': 5});
  });

  test('agrega la sesión y la cartera, y normaliza la barra final de la dirección', () async {
    api
      ..token = 'abc'
      ..carteraId = 7;
    await api.get('/api/v1/clientes', consulta: {'q': 'ana', 'vacio': ''});
    final r = vistas.single;
    expect(r.url.toString(), 'http://servidor.test/api/v1/clientes?q=ana');
    expect(r.headers['authorization'], 'Bearer abc');
    expect(r.headers['x-cartera-id'], '7');
  });

  test('los errores del servidor llegan con su mensaje', () async {
    final conError = ApiClient(
      baseUrl: 'http://s.test',
      cliente: MockClient((_) async => _utf8({'error': {'codigo': 'DIA_CERRADO', 'mensaje': 'El día está cerrado.'}}, 409)),
    );
    await expectLater(
      conError.post('/api/v1/gastos', cuerpo: {}),
      throwsA(isA<ApiError>().having((e) => e.codigo, 'codigo', 'DIA_CERRADO').having((e) => e.toString(), 'mensaje', 'El día está cerrado.')),
    );
  });

  test('un 401 con sesión activa avisa para volver al login', () async {
    var avisos = 0;
    final vencida = ApiClient(
      baseUrl: 'http://s.test',
      cliente: MockClient((_) async => _utf8({'error': {'codigo': 'NO_AUTENTICADO', 'mensaje': 'Sesión inválida o vencida'}}, 401)),
    )
      ..token = 'viejo'
      ..alExpirarSesion = () => avisos++;
    await expectLater(vencida.get('/api/v1/clientes'), throwsA(isA<ApiError>()));
    expect(avisos, 1);
  });

  test('sin conexión se informa con un mensaje claro', () async {
    final caido = ApiClient(baseUrl: 'http://s.test', cliente: MockClient((_) async => throw Exception('socket')));
    await expectLater(caido.get('/x'), throwsA(isA<ApiError>().having((e) => e.sinConexion, 'sinConexion', isTrue)));
  });
}
