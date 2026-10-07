import 'package:financiera_app/core/formato.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';

void main() {
  setUpAll(() => initializeDateFormatting('es_CO'));

  test('dinero y miles usan el formato de Colombia', () {
    expect(dinero(1440), r'$ 1.440');
    expect(dinero(1234567), r'$ 1.234.567');
    expect(miles(1200), '1.200');
    expect(decimales(3.5), '3,50');
  });

  test('las fechas se muestran en español', () {
    expect(fechaLarga('2026-10-06'), '06 oct. 2026');
    expect(fechaLarga('2026-01-31'), '31 ene. 2026');
    expect(aFechaIso(DateTime(2026, 10, 6)), '2026-10-06');
    expect(desdeFechaIso('2026-10-06'), DateTime(2026, 10, 6));
  });

  test('los instantes UTC se muestran en hora de Colombia (UTC-5)', () {
    expect(fechaHoraColombia('2026-10-06T15:05:00.000Z'), '06/10/2026 10:05');
    expect(horaColombia('2026-10-07T04:59:00.000Z'), '23:59');
    expect(fechaHoraColombia('2026-10-07T05:00:00.000Z'), '07/10/2026 00:00');
  });

  test('valorEntero ignora los separadores', () {
    expect(valorEntero('1.440'), 1440);
    expect(valorEntero(r'$ 25.000'), 25000);
    expect(valorEntero(''), isNull);
    expect(valorEntero('abc'), isNull);
  });

  test('el formateador agrega puntos de miles mientras se escribe', () {
    const f = FormatoMiles();
    final r = f.formatEditUpdate(TextEditingValue.empty, const TextEditingValue(text: '1440'));
    expect(r.text, '1.440');
    expect(f.formatEditUpdate(TextEditingValue.empty, const TextEditingValue(text: 'abc')).text, '');
    expect(f.formatEditUpdate(const TextEditingValue(text: '1.440'), const TextEditingValue(text: '1.4400')).text, '14.400');
  });
}
