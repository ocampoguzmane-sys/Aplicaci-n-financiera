import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../core/api.dart';
import '../modelos/modelos.dart';

/// Dónde se guardan el token y el servidor entre ejecuciones.
abstract class AlmacenSesion {
  Future<String?> leer(String clave);
  Future<void> escribir(String clave, String valor);
  Future<void> borrar(String clave);
}

/// Almacenamiento cifrado del sistema (Keychain, Keystore, Credential Locker).
class AlmacenSeguro implements AlmacenSesion {
  const AlmacenSeguro();
  static const _almacen = FlutterSecureStorage();

  @override
  Future<String?> leer(String clave) async {
    try {
      return await _almacen.read(key: clave);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> escribir(String clave, String valor) async {
    try {
      await _almacen.write(key: clave, value: valor);
    } catch (_) {}
  }

  @override
  Future<void> borrar(String clave) async {
    try {
      await _almacen.delete(key: clave);
    } catch (_) {}
  }
}

/// Para pruebas.
class AlmacenMemoria implements AlmacenSesion {
  final Map<String, String> datos = {};
  @override
  Future<String?> leer(String clave) async => datos[clave];
  @override
  Future<void> escribir(String clave, String valor) async => datos[clave] = valor;
  @override
  Future<void> borrar(String clave) async => datos.remove(clave);
}

enum EstadoSesion { iniciando, sinSesion, activa }

/// Sesión del usuario: quién es, qué puede hacer y sobre qué cartera trabaja.
/// Los permisos los decide el servidor; la app solo los usa para mostrar u ocultar opciones.
class Sesion extends ChangeNotifier {
  Sesion({required this.almacen, required this.urlPorDefecto, ApiClient? api})
      : api = api ?? ApiClient(baseUrl: urlPorDefecto) {
    this.api.alExpirarSesion = () => cerrarSesion(expiro: true);
  }

  final AlmacenSesion almacen;
  final String urlPorDefecto;
  final ApiClient api;

  EstadoSesion estado = EstadoSesion.iniciando;
  Usuario? usuario;
  Empresa? empresa;
  Set<String> permisos = {};
  List<Cartera> carteras = [];
  Cartera? cartera;
  InfoDia? dia;
  Catalogos? catalogos;
  String? aviso;

  bool puede(String permiso) => permisos.contains(permiso);
  bool get puedeElegirCartera => puede('carteras.ver_todas') && carteras.length > 1;
  double get tasa => 1 + (catalogos?.utilidadPorDefecto ?? 20) / 100;

  String get urlServidor => api.baseUrl;

  Future<void> restaurar() async {
    // En la web la dirección es siempre la de la propia página; en el resto, la última usada.
    api.baseUrl = kIsWeb ? urlPorDefecto : (await almacen.leer('url') ?? urlPorDefecto);
    final token = await almacen.leer('token');
    if (token == null) {
      estado = EstadoSesion.sinSesion;
      notifyListeners();
      return;
    }
    api.token = token;
    try {
      await _cargarContexto(await api.get('/api/v1/auth/me') as Json);
    } on ApiError catch (e) {
      // Sin conexión no se descarta la sesión guardada; el usuario puede reintentar.
      await _descartar(e.sinConexion ? 'No se pudo conectar con el servidor.' : null);
    }
  }

  Future<void> iniciar({required String codigo, required String usuario, required String clave, String? url}) async {
    if (url != null && url.trim().isNotEmpty) api.baseUrl = url.trim();
    aviso = null;
    final r = await api.post('/api/v1/auth/login', cuerpo: {'codigo': codigo.trim(), 'usuario': usuario.trim(), 'contrasena': clave}) as Json;
    api.token = r['token'] as String;
    await almacen.escribir('token', api.token!);
    await almacen.escribir('url', api.baseUrl);
    try {
      await _cargarContexto(r);
    } catch (_) {
      await _descartar(null);
      rethrow;
    }
  }

  Future<void> _cargarContexto(Json perfil) async {
    usuario = Usuario.fromJson(perfil['usuario'] as Json);
    empresa = Empresa.fromJson(perfil['empresa'] as Json);
    permisos = (perfil['permisos'] as List).cast<String>().toSet();
    catalogos = Catalogos.fromJson(await api.get('/api/v1/catalogos') as Json);
    carteras = (await api.get('/api/v1/carteras') as List).map((e) => Cartera.fromJson(e as Json)).where((c) => c.activa).toList();

    final guardada = int.tryParse(await almacen.leer('cartera') ?? '');
    cartera = carteras.where((c) => c.id == guardada && puede('carteras.ver_todas')).firstOrNull ??
        carteras.where((c) => c.id == usuario!.carteraId).firstOrNull ??
        carteras.firstOrNull;
    api.carteraId = cartera?.id;
    dia = null;
    if (cartera != null) await refrescarDia();
    estado = EstadoSesion.activa;
    notifyListeners();
  }

  Future<void> refrescarDia() async {
    if (cartera == null) return;
    dia = InfoDia.fromJson(await api.get('/api/v1/dia') as Json);
    notifyListeners();
  }

  Future<void> seleccionarCartera(Cartera nueva) async {
    cartera = nueva;
    api.carteraId = nueva.id;
    await almacen.escribir('cartera', '${nueva.id}');
    dia = null;
    notifyListeners();
    await refrescarDia();
  }

  Future<void> abrirDia() async {
    dia = InfoDia.fromJson(await api.post('/api/v1/dia/abrir') as Json);
    notifyListeners();
  }

  Future<void> cerrarDia() async {
    dia = InfoDia.fromJson(await api.post('/api/v1/dia/cerrar') as Json);
    notifyListeners();
  }

  /// Vuelve a leer las carteras (después de crear o desactivar una).
  Future<void> recargarCarteras() async {
    carteras = (await api.get('/api/v1/carteras') as List).map((e) => Cartera.fromJson(e as Json)).where((c) => c.activa).toList();
    cartera = carteras.where((c) => c.id == cartera?.id).firstOrNull ?? carteras.firstOrNull;
    api.carteraId = cartera?.id;
    notifyListeners();
  }

  Future<void> cerrarSesion({bool expiro = false}) => _descartar(expiro ? 'Tu sesión venció. Inicia sesión de nuevo.' : null);

  Future<void> _descartar(String? mensaje) async {
    await almacen.borrar('token');
    api.token = null;
    api.carteraId = null;
    usuario = null;
    empresa = null;
    permisos = {};
    carteras = [];
    cartera = null;
    dia = null;
    aviso = mensaje;
    estado = EstadoSesion.sinSesion;
    notifyListeners();
  }

  @override
  void dispose() {
    api.cerrar();
    super.dispose();
  }
}
