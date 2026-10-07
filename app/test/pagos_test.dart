import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ayuda.dart';

void main() {
  testWidgets('registrar un pago en efectivo envía el valor y la forma correctos', (tester) async {
    final servidor = ServidorFalso(rol: 'empleado');
    final sesion = crearSesion(servidor);
    await sesion.restaurar();
    await montarApp(tester, sesion);
    await iniciarSesion(tester, 'empleado');

    await tester.tap(find.text('Registrar Pagos'));
    await tester.pumpAndSettle();
    expect(find.text('ANA MARÍA PÉREZ'), findsOneWidget);
    expect(find.text('Créditos vigentes: '), findsOneWidget);

    await tester.tap(find.widgetWithText(FilledButton, 'Pagar'));
    await tester.pumpAndSettle();
    expect(find.text('Abonar cuota · crédito 9'), findsOneWidget);
    // El valor sugerido es la cuota.
    expect(find.widgetWithText(TextField, '60'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, '60'), '100');
    await tester.tap(find.widgetWithText(FilledButton, 'Efectivo'));
    await tester.pumpAndSettle();

    final pago = servidor.peticiones.lastWhere((p) => p.metodo == 'POST' && p.ruta == '/api/v1/creditos/9/pagos');
    expect(pago.cuerpo, {'valor': 100, 'forma': 'EF'});
    expect(find.text(r'Pago de $ 100 registrado. Nuevo saldo: $ 1.080'), findsOneWidget);
  });

  testWidgets('el pago por transferencia y la nota viajan al servidor', (tester) async {
    final servidor = ServidorFalso(rol: 'supervisor');
    final sesion = crearSesion(servidor);
    await sesion.restaurar();
    await montarApp(tester, sesion);
    await iniciarSesion(tester, 'supervisor');

    await tester.tap(find.text('Registrar Pagos'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Pagar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, 'Nota (opcional)'), 'Pagó por Nequi');
    await tester.tap(find.widgetWithText(FilledButton, 'Transferencia'));
    await tester.pumpAndSettle();

    final pago = servidor.peticiones.lastWhere((p) => p.ruta == '/api/v1/creditos/9/pagos');
    expect(pago.cuerpo, {'valor': 60, 'forma': 'TR', 'nota': 'Pagó por Nequi'});
  });

  testWidgets('no envía un pago sin valor', (tester) async {
    final servidor = ServidorFalso(rol: 'empleado');
    final sesion = crearSesion(servidor);
    await sesion.restaurar();
    await montarApp(tester, sesion);
    await iniciarSesion(tester, 'empleado');
    await tester.tap(find.text('Registrar Pagos'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Pagar'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextField, '60'), '');
    await tester.tap(find.widgetWithText(FilledButton, 'Efectivo'));
    await tester.pumpAndSettle();
    expect(servidor.peticiones.where((p) => p.ruta == '/api/v1/creditos/9/pagos'), isEmpty);
    expect(find.text('Escribe el valor del pago'), findsOneWidget);
  });
}
