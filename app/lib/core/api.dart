import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

/// Error devuelto por el servidor o por la conexión, con un mensaje listo para mostrar.
class ApiError implements Exception {
  ApiError(this.estado, this.codigo, this.mensaje);

  final int estado;
  final String codigo;
  final String mensaje;

  bool get sinConexion => estado == 0;

  @override
  String toString() => mensaje;
}

/// Cliente de la API. Agrega la sesión y la cartera elegida a cada petición.
class ApiClient {
  ApiClient({required this.baseUrl, http.Client? cliente})
      : _http = cliente ?? http.Client();

  String baseUrl;
  String? token;
  int? carteraId;

  /// Se llama cuando el servidor responde 401 con una sesión activa.
  void Function()? alExpirarSesion;

  final http.Client _http;
  static const _espera = Duration(seconds: 20);

  Uri _uri(String ruta, Map<String, String?>? consulta) {
    final base = baseUrl.endsWith('/') ? baseUrl.substring(0, baseUrl.length - 1) : baseUrl;
    final limpia = <String, String>{
      for (final e in (consulta ?? {}).entries)
        if (e.value != null && e.value!.isNotEmpty) e.key: e.value!,
    };
    return Uri.parse('$base$ruta').replace(queryParameters: limpia.isEmpty ? null : limpia);
  }

  Map<String, String> get _cabeceras => {
        'accept': 'application/json',
        if (token != null) 'authorization': 'Bearer $token',
        if (carteraId != null) 'x-cartera-id': '$carteraId',
      };

  Future<dynamic> _enviar(
    String metodo,
    String ruta, {
    Object? cuerpo,
    Map<String, String?>? consulta,
  }) async {
    final peticion = http.Request(metodo, _uri(ruta, consulta))..headers.addAll(_cabeceras);
    if (cuerpo != null) {
      peticion.headers['content-type'] = 'application/json';
      peticion.body = jsonEncode(cuerpo);
    }
    http.Response respuesta;
    try {
      respuesta = await http.Response.fromStream(await _http.send(peticion).timeout(_espera));
    } on TimeoutException {
      throw ApiError(0, 'SIN_CONEXION', 'El servidor no respondió. Revisa tu conexión.');
    } catch (_) {
      throw ApiError(0, 'SIN_CONEXION', 'No hay conexión con el servidor.');
    }
    final texto = utf8.decode(respuesta.bodyBytes);
    dynamic datos;
    if (texto.isNotEmpty) {
      try {
        datos = jsonDecode(texto);
      } catch (_) {
        datos = null;
      }
    }
    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) return datos;

    final error = datos is Map ? datos['error'] : null;
    final codigo = error is Map ? '${error['codigo']}' : 'ERROR';
    final mensaje = error is Map ? '${error['mensaje']}' : 'Error ${respuesta.statusCode}';
    if (respuesta.statusCode == 401 && token != null && codigo == 'NO_AUTENTICADO') {
      alExpirarSesion?.call();
    }
    throw ApiError(respuesta.statusCode, codigo, mensaje);
  }

  Future<dynamic> get(String ruta, {Map<String, String?>? consulta}) =>
      _enviar('GET', ruta, consulta: consulta);
  Future<dynamic> post(String ruta, {Object? cuerpo}) => _enviar('POST', ruta, cuerpo: cuerpo);
  Future<dynamic> put(String ruta, {Object? cuerpo}) => _enviar('PUT', ruta, cuerpo: cuerpo);
  Future<dynamic> patch(String ruta, {Object? cuerpo}) => _enviar('PATCH', ruta, cuerpo: cuerpo);
  Future<dynamic> delete(String ruta) => _enviar('DELETE', ruta);

  void cerrar() => _http.close();
}
