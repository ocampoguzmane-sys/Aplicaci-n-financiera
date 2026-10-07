// Modelos de las respuestas de la API (ver backend/src/rutas.ts).

typedef Json = Map<String, dynamic>;

int _i(Object? v) => (v as num).toInt();
int? _in(Object? v) => v == null ? null : (v as num).toInt();
double _d(Object? v) => (v as num).toDouble();
List<T> _lista<T>(Object? v, T Function(Json) f) =>
    (v as List).map((e) => f(e as Json)).toList();

class Usuario {
  Usuario({
    required this.id,
    required this.usuario,
    required this.nombre,
    required this.rol,
    required this.carteraId,
    required this.carteraNombre,
    required this.activo,
  });

  final int id;
  final String usuario;
  final String nombre;
  final String rol;
  final int? carteraId;
  final String? carteraNombre;
  final bool activo;

  factory Usuario.fromJson(Json j) => Usuario(
        id: _i(j['id']),
        usuario: j['usuario'] as String,
        nombre: j['nombre'] as String,
        rol: j['rol'] as String,
        carteraId: _in(j['carteraId']),
        carteraNombre: j['carteraNombre'] as String?,
        activo: j['activo'] as bool? ?? true,
      );

  String get etiquetaRol => etiquetaDeRol(rol);
}

String etiquetaDeRol(String rol) => switch (rol) {
      'administrador' => 'Administrador',
      'supervisor' => 'Supervisor',
      'empleado' => 'Empleado',
      _ => rol,
    };

class Empresa {
  Empresa({required this.codigo, required this.nombre});
  final String codigo;
  final String nombre;
  factory Empresa.fromJson(Json j) => Empresa(codigo: j['codigo'] as String, nombre: j['nombre'] as String);
}

class Cartera {
  Cartera({required this.id, required this.nombre, required this.ordenModo, required this.activa});
  final int id;
  final String nombre;
  final String ordenModo;
  final bool activa;
  factory Cartera.fromJson(Json j) => Cartera(
        id: _i(j['id']),
        nombre: j['nombre'] as String,
        ordenModo: j['ordenModo'] as String,
        activa: j['activa'] as bool,
      );
}

class InfoDia {
  InfoDia({required this.fecha, required this.estado, this.cierreAutomatico = false});
  final String fecha;

  /// ABIERTO, CERRADO o SIN_ABRIR.
  final String estado;
  final bool cierreAutomatico;

  bool get abierto => estado == 'ABIERTO';
  String get etiqueta => abierto ? 'Abierto' : 'Cerrado';

  factory InfoDia.fromJson(Json j) => InfoDia(
        fecha: j['fecha'] as String,
        estado: j['estado'] as String,
        cierreAutomatico: j['cierreAutomatico'] as bool? ?? false,
      );
}

class Catalogos {
  Catalogos({
    required this.utilidades,
    required this.cuotas,
    required this.periodos,
    required this.tiposGasto,
    required this.roles,
    required this.calificaciones,
    required this.utilidadPorDefecto,
    required this.cuotasPorDefecto,
    required this.periodoPorDefecto,
  });

  final List<int> utilidades;
  final List<int> cuotas;
  final List<String> periodos;
  final List<String> tiposGasto;
  final List<String> roles;
  final List<String> calificaciones;
  final int utilidadPorDefecto;
  final int cuotasPorDefecto;
  final String periodoPorDefecto;

  factory Catalogos.fromJson(Json j) {
    final d = j['porDefecto'] as Json;
    return Catalogos(
      utilidades: (j['utilidades'] as List).map(_i).toList(),
      cuotas: (j['cuotas'] as List).map(_i).toList(),
      periodos: (j['periodos'] as List).cast<String>(),
      tiposGasto: (j['tiposGasto'] as List).cast<String>(),
      roles: (j['roles'] as List).cast<String>(),
      calificaciones: (j['calificaciones'] as List).cast<String>(),
      utilidadPorDefecto: _i(d['utilidad']),
      cuotasPorDefecto: _i(d['cuotas']),
      periodoPorDefecto: d['periodo'] as String,
    );
  }
}

class ResumenCliente {
  ResumenCliente({
    required this.id,
    required this.nombre,
    required this.identificacion,
    required this.barrio,
    required this.telefono,
    required this.calificacion,
    required this.vigentes,
    required this.pagados,
    required this.total,
    required this.activo,
  });

  final int id;
  final String nombre;
  final String identificacion;
  final String barrio;
  final String telefono;
  final String calificacion;
  final int vigentes;
  final int pagados;
  final int total;
  final bool activo;

  factory ResumenCliente.fromJson(Json j) => ResumenCliente(
        id: _i(j['id']),
        nombre: j['nombre'] as String,
        identificacion: j['identificacion'] as String,
        barrio: j['barrio'] as String,
        telefono: j['telefono'] as String,
        calificacion: j['calificacion'] as String,
        vigentes: _i(j['vigentes']),
        pagados: _i(j['pagados']),
        total: _i(j['total']),
        activo: j['activo'] as bool,
      );
}

class ListaClientes {
  ListaClientes({required this.totalClientes, required this.clientesActivos, required this.items});
  final int totalClientes;
  final int clientesActivos;
  final List<ResumenCliente> items;
  factory ListaClientes.fromJson(Json j) => ListaClientes(
        totalClientes: _i(j['totalClientes']),
        clientesActivos: _i(j['clientesActivos']),
        items: _lista(j['items'], ResumenCliente.fromJson),
      );
}

class Referencia {
  Referencia({required this.nombres, required this.direccion, required this.barrio, required this.telefono, required this.detalle});
  final String nombres;
  final String direccion;
  final String barrio;
  final String telefono;
  final String detalle;
  factory Referencia.fromJson(Json j) => Referencia(
        nombres: j['nombres'] as String,
        direccion: j['direccion'] as String,
        barrio: j['barrio'] as String,
        telefono: j['telefono'] as String,
        detalle: j['detalle'] as String? ?? '',
      );
}

class DetalleCliente {
  DetalleCliente({
    required this.id,
    required this.identificacion,
    required this.nombres,
    required this.apellidos,
    required this.direccion,
    required this.barrio,
    required this.telefono,
    required this.calificacion,
    required this.referencias,
    required this.creditoIds,
  });

  final int id;
  final String identificacion;
  final String nombres;
  final String apellidos;
  final String direccion;
  final String barrio;
  final String telefono;
  final String calificacion;
  final List<Referencia> referencias;

  /// Identificadores de sus créditos, del más reciente al más antiguo.
  final List<int> creditoIds;

  String get nombre => '$nombres $apellidos';

  factory DetalleCliente.fromJson(Json j) => DetalleCliente(
        id: _i(j['id']),
        identificacion: j['identificacion'] as String,
        nombres: j['nombres'] as String,
        apellidos: j['apellidos'] as String,
        direccion: j['direccion'] as String,
        barrio: j['barrio'] as String,
        telefono: j['telefono'] as String,
        calificacion: j['calificacion'] as String,
        referencias: _lista(j['referencias'], Referencia.fromJson),
        creditoIds: (j['creditos'] as List).map((e) => _i((e as Json)['id'])).toList(),
      );
}

class CreditoVigente {
  CreditoVigente({
    required this.id,
    required this.clienteId,
    required this.cliente,
    required this.valorCredito,
    required this.saldo,
    required this.valorCuota,
    required this.nPagos,
    required this.cuotasPagadas,
    required this.periodo,
    required this.fecha,
    required this.ultimoPago,
  });

  final int id;
  final int clienteId;
  final String cliente;
  final int valorCredito;
  final int saldo;
  final int valorCuota;
  final int nPagos;
  final double cuotasPagadas;
  final String periodo;
  final String fecha;
  final String? ultimoPago;

  factory CreditoVigente.fromJson(Json j) => CreditoVigente(
        id: _i(j['id']),
        clienteId: _i(j['clienteId']),
        cliente: j['cliente'] as String,
        valorCredito: _i(j['valorCredito']),
        saldo: _i(j['saldo']),
        valorCuota: _i(j['valorCuota']),
        nPagos: _i(j['nPagos']),
        cuotasPagadas: _d(j['cuotasPagadas']),
        periodo: j['periodo'] as String,
        fecha: j['fecha'] as String,
        ultimoPago: j['ultimoPago'] as String?,
      );
}

class ListaCreditos {
  ListaCreditos({required this.creditosVigentes, required this.items});
  final int creditosVigentes;
  final List<CreditoVigente> items;
  factory ListaCreditos.fromJson(Json j) => ListaCreditos(
        creditosVigentes: _i(j['creditosVigentes']),
        items: _lista(j['items'], CreditoVigente.fromJson),
      );
}

class PagoInforme {
  PagoInforme({required this.id, required this.item, required this.valor, required this.fecha, required this.forma, required this.saldo, required this.modificado});
  final int id;
  final int item;
  final int valor;
  final String fecha;
  final String forma;
  final int saldo;
  final bool modificado;
  factory PagoInforme.fromJson(Json j) => PagoInforme(
        id: _i(j['id']),
        item: _i(j['item']),
        valor: _i(j['valor']),
        fecha: j['fecha'] as String,
        forma: j['forma'] as String,
        saldo: _i(j['saldo']),
        modificado: j['modificado'] as bool,
      );
}

class InformeCredito {
  InformeCredito({
    required this.id,
    required this.creadoEn,
    required this.cliente,
    required this.capital,
    required this.intereses,
    required this.tasa,
    required this.cuotas,
    required this.valorCuota,
    required this.valorTotal,
    required this.vence,
    required this.periodo,
    required this.estado,
    required this.saldo,
    required this.totalAbonos,
    required this.nPagos,
    required this.cuotasPagadas,
    required this.pagos,
  });

  final int id;
  final String creadoEn;
  final String cliente;
  final int capital;
  final int intereses;
  final int tasa;
  final int cuotas;
  final int valorCuota;
  final int valorTotal;
  final String vence;
  final String periodo;
  final String estado;
  final int saldo;
  final int totalAbonos;
  final int nPagos;
  final double cuotasPagadas;
  final List<PagoInforme> pagos;

  factory InformeCredito.fromJson(Json j) => InformeCredito(
        id: _i(j['id']),
        creadoEn: j['creadoEn'] as String,
        cliente: (j['cliente'] as Json)['nombre'] as String,
        capital: _i(j['capital']),
        intereses: _i(j['intereses']),
        tasa: _i(j['tasa']),
        cuotas: _i(j['cuotas']),
        valorCuota: _i(j['valorCuota']),
        valorTotal: _i(j['valorTotal']),
        vence: j['vence'] as String,
        periodo: j['periodo'] as String,
        estado: j['estado'] as String,
        saldo: _i(j['saldo']),
        totalAbonos: _i(j['totalAbonos']),
        nPagos: _i(j['nPagos']),
        cuotasPagadas: _d(j['cuotasPagadas']),
        pagos: _lista(j['pagos'], PagoInforme.fromJson),
      );
}

class ResultadoPago {
  ResultadoPago({required this.mensaje, required this.saldo});
  final String mensaje;
  final int saldo;
  factory ResultadoPago.fromJson(Json j) => ResultadoPago(mensaje: j['mensaje'] as String, saldo: _i(j['saldo']));
}

class Gasto {
  Gasto({required this.id, required this.tipo, required this.valor, required this.detalle, required this.fecha, required this.usuario});
  final int id;
  final String tipo;
  final int valor;
  final String detalle;
  final String fecha;
  final String usuario;
  factory Gasto.fromJson(Json j) => Gasto(
        id: _i(j['id']),
        tipo: j['tipo'] as String,
        valor: _i(j['valor']),
        detalle: j['detalle'] as String? ?? '',
        fecha: j['fecha'] as String,
        usuario: j['usuario'] as String,
      );
}

class ConsultaGastos {
  ConsultaGastos({required this.total, required this.items});
  final int total;
  final List<Gasto> items;
  factory ConsultaGastos.fromJson(Json j) => ConsultaGastos(total: _i(j['total']), items: _lista(j['items'], Gasto.fromJson));
}

class MovimientoBase {
  MovimientoBase({required this.tipo, required this.valor, required this.detalle, required this.fecha, required this.usuario});
  final String tipo;
  final int valor;
  final String detalle;
  final String fecha;
  final String usuario;
  bool get esAdicion => tipo == 'ADICION';
  factory MovimientoBase.fromJson(Json j) => MovimientoBase(
        tipo: j['tipo'] as String,
        valor: _i(j['valor']),
        detalle: j['detalle'] as String? ?? '',
        fecha: j['fecha'] as String,
        usuario: j['usuario'] as String,
      );
}

class ConsultaBase {
  ConsultaBase({required this.saldo, required this.movimientos});
  final int saldo;
  final List<MovimientoBase> movimientos;
  factory ConsultaBase.fromJson(Json j) => ConsultaBase(saldo: _i(j['saldo']), movimientos: _lista(j['movimientos'], MovimientoBase.fromJson));
}

class Cierre {
  Cierre({
    required this.fecha,
    required this.estado,
    required this.base,
    required this.adiciones,
    required this.retiros,
    required this.recaudos,
    required this.efectivo,
    required this.transferencia,
    required this.ventas,
    required this.gastos,
    required this.totalDia,
    required this.efectividadRecaudo,
    required this.utilidadDiariaAprox,
  });

  final String fecha;
  final String estado;
  final int base;
  final int adiciones;
  final int retiros;
  final int recaudos;
  final int efectivo;
  final int transferencia;
  final int ventas;
  final int gastos;
  final int totalDia;
  final double? efectividadRecaudo;
  final int utilidadDiariaAprox;

  factory Cierre.fromJson(Json j) {
    final r = j['recaudos'] as Json;
    return Cierre(
      fecha: j['fecha'] as String,
      estado: j['estado'] as String,
      base: _i(j['base']),
      adiciones: _i(j['adiciones']),
      retiros: _i(j['retiros']),
      recaudos: _i(r['total']),
      efectivo: _i(r['efectivo']),
      transferencia: _i(r['transferencia']),
      ventas: _i(j['ventas']),
      gastos: _i(j['gastos']),
      totalDia: _i(j['totalDia']),
      efectividadRecaudo: j['efectividadRecaudo'] == null ? null : _d(j['efectividadRecaudo']),
      utilidadDiariaAprox: _i(j['utilidadDiariaAprox']),
    );
  }
}

class PagoDelDia {
  PagoDelDia({required this.cliente, required this.valor, required this.saldo, required this.numeroPago, required this.periodo, required this.forma, required this.hora});
  final String cliente;
  final int valor;
  final int saldo;
  final int numeroPago;
  final String periodo;
  final String forma;
  final String hora;
  factory PagoDelDia.fromJson(Json j) => PagoDelDia(
        cliente: j['cliente'] as String,
        valor: _i(j['valor']),
        saldo: _i(j['saldo']),
        numeroPago: _i(j['numeroPago']),
        periodo: j['periodo'] as String,
        forma: j['formaEtiqueta'] as String,
        hora: j['hora'] as String,
      );
}

class CreditoDelDia {
  CreditoDelDia({required this.cliente, required this.capital, required this.total, required this.cuotas, required this.valorCuota, required this.periodo});
  final String cliente;
  final int capital;
  final int total;
  final int cuotas;
  final int valorCuota;
  final String periodo;
  factory CreditoDelDia.fromJson(Json j) => CreditoDelDia(
        cliente: j['cliente'] as String,
        capital: _i(j['capital']),
        total: _i(j['total']),
        cuotas: _i(j['cuotas']),
        valorCuota: _i(j['valorCuota']),
        periodo: j['periodo'] as String,
      );
}

class Transacciones {
  Transacciones({
    required this.pagos,
    required this.totalPagos,
    required this.efectivo,
    required this.transferencia,
    required this.creditos,
    required this.totalCreditos,
    required this.gastos,
    required this.totalGastos,
  });

  final List<PagoDelDia> pagos;
  final int totalPagos;
  final int efectivo;
  final int transferencia;
  final List<CreditoDelDia> creditos;
  final int totalCreditos;
  final List<Gasto> gastos;
  final int totalGastos;

  factory Transacciones.fromJson(Json j) {
    final p = j['pagos'] as Json;
    final c = j['creditos'] as Json;
    final g = j['gastos'] as Json;
    return Transacciones(
      pagos: _lista(p['items'], PagoDelDia.fromJson),
      totalPagos: _i(p['total']),
      efectivo: _i(p['efectivo']),
      transferencia: _i(p['transferencia']),
      creditos: _lista(c['items'], CreditoDelDia.fromJson),
      totalCreditos: _i(c['total']),
      gastos: (g['items'] as List)
          .map((e) => Gasto(
                id: _i((e as Json)['id']),
                tipo: e['tipo'] as String,
                valor: _i(e['valor']),
                detalle: e['detalle'] as String? ?? '',
                fecha: j['fecha'] as String,
                usuario: e['usuario'] as String,
              ))
          .toList(),
      totalGastos: _i(g['total']),
    );
  }
}

class Cuota {
  Cuota({required this.numero, required this.valor, required this.saldo, required this.fecha});
  final int numero;
  final int valor;
  final int saldo;
  final String fecha;
  factory Cuota.fromJson(Json j) => Cuota(numero: _i(j['numero']), valor: _i(j['valor']), saldo: _i(j['saldo']), fecha: j['fecha'] as String);
}

class Cronograma {
  Cronograma({required this.interes, required this.total, required this.valorCuota, required this.cuotas, required this.vence});
  final int interes;
  final int total;
  final int valorCuota;
  final List<Cuota> cuotas;
  final String vence;
  factory Cronograma.fromJson(Json j) => Cronograma(
        interes: _i(j['interes']),
        total: _i(j['total']),
        valorCuota: _i(j['valorCuota']),
        cuotas: _lista(j['cuotas'], Cuota.fromJson),
        vence: j['vence'] as String,
      );
}

class Nota {
  Nota({required this.cliente, required this.texto, required this.fecha, required this.usuario});
  final String cliente;
  final String texto;
  final String fecha;
  final String usuario;
  factory Nota.fromJson(Json j) => Nota(
        cliente: j['cliente'] as String,
        texto: j['texto'] as String,
        fecha: j['fecha'] as String,
        usuario: j['usuario'] as String,
      );
}

class UsuarioAdmin {
  UsuarioAdmin({required this.id, required this.usuario, required this.nombre, required this.rol, required this.carteraId, required this.carteraNombre, required this.activo});
  final int id;
  final String usuario;
  final String nombre;
  final String rol;
  final int? carteraId;
  final String? carteraNombre;
  final bool activo;
  factory UsuarioAdmin.fromJson(Json j) => UsuarioAdmin(
        id: _i(j['id']),
        usuario: j['usuario'] as String,
        nombre: j['nombre'] as String,
        rol: j['rol'] as String,
        carteraId: _in(j['carteraId']),
        carteraNombre: j['carteraNombre'] as String?,
        activo: j['activo'] as bool,
      );
}
