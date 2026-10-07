import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

final NumberFormat _miles = NumberFormat.decimalPattern('es_CO');

/// 1440 → "$ 1.440" (el símbolo va antes, como se escribe en Colombia); −500 → "-$ 500"
String dinero(num valor) => '${valor < 0 ? '-' : ''}\$ ${_miles.format(valor.abs())}';

/// 1440 → "1.440"
String miles(num valor) => _miles.format(valor);

/// 5.0 → "5,00"
String decimales(num valor) => NumberFormat('0.00', 'es_CO').format(valor);

const _meses = [
  'ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.',
  'jul.', 'ago.', 'sep.', 'oct.', 'nov.', 'dic.'
];

/// "2026-10-06" → "06 oct. 2026"
String fechaLarga(String fecha) {
  final p = fecha.split('-');
  if (p.length != 3) return fecha;
  return '${p[2]} ${_meses[int.parse(p[1]) - 1]} ${p[0]}';
}

/// Instante ISO en UTC → "06/10/2026 10:05" en hora de Colombia (UTC-5, sin horario de verano).
String fechaHoraColombia(String iso) {
  final d = DateTime.parse(iso).toUtc().subtract(const Duration(hours: 5));
  return DateFormat('dd/MM/yyyy HH:mm').format(d);
}

/// Instante ISO en UTC → "10:05" en hora de Colombia.
String horaColombia(String iso) {
  final d = DateTime.parse(iso).toUtc().subtract(const Duration(hours: 5));
  return DateFormat('HH:mm').format(d);
}

/// Fecha de negocio (AAAA-MM-DD) para enviar al servidor.
String aFechaIso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

DateTime desdeFechaIso(String fecha) {
  final p = fecha.split('-').map(int.parse).toList();
  return DateTime(p[0], p[1], p[2]);
}

/// Texto con puntos de miles mientras se escribe: 1440 → "1.440".
class FormatoMiles extends TextInputFormatter {
  const FormatoMiles();

  @override
  TextEditingValue formatEditUpdate(TextEditingValue anterior, TextEditingValue nuevo) {
    final digitos = nuevo.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digitos.isEmpty) return const TextEditingValue();
    final texto = _miles.format(int.parse(digitos));
    return TextEditingValue(
      text: texto,
      selection: TextSelection.collapsed(offset: texto.length),
    );
  }
}

/// "1.440" → 1440; vacío o inválido → null.
int? valorEntero(String texto) {
  final digitos = texto.replaceAll(RegExp(r'[^0-9]'), '');
  return digitos.isEmpty ? null : int.parse(digitos);
}
