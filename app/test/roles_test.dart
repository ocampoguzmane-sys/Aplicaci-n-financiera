// Qué ve y qué puede hacer cada rol en la pantalla de inicio (docs/roles.md).
import 'package:financiera_app/estado/sesion.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'ayuda.dart';

Finder opcion(String texto) => find.widgetWithText(ListTile, texto);

void main() {
  group('inicio de sesión', () {
    testWidgets('pide código, usuario y contraseña, y rechaza credenciales incorrectas con un mensaje claro', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);

      expect(find.text('Ingresa tus credenciales para acceder'), findsOneWidget);
      await iniciarSesion(tester, 'administrador', clave: 'incorrecta');
      expect(find.text('Código, usuario o contraseña incorrectos'), findsOneWidget);
      expect(sesion.estado, EstadoSesion.sinSesion);

      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await tester.pumpAndSettle();
      await iniciarSesion(tester, 'administrador');
      expect(sesion.estado, EstadoSesion.activa);
      expect(find.text('Empresa de prueba'.toUpperCase()), findsOneWidget);
    });

    testWidgets('no envía nada si faltan campos', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await tester.tap(find.widgetWithText(FilledButton, 'Ingresar'));
      await tester.pumpAndSettle();
      expect(find.text('Escribe el código, el usuario y la contraseña.'), findsOneWidget);
      expect(servidor.peticiones.where((p) => p.ruta.endsWith('/login')), isEmpty);
    });

    testWidgets('recuerda la sesión: al reabrir la app entra directo', (tester) async {
      final servidor = ServidorFalso(rol: 'supervisor');
      final almacen = AlmacenMemoria()..datos['token'] = 'token-guardado';
      final sesion = crearSesion(servidor, almacen: almacen);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      expect(sesion.estado, EstadoSesion.activa);
      expect(find.text('Clientes'), findsOneWidget);
    });

    testWidgets('si la sesión venció, vuelve al login con un aviso', (tester) async {
      final servidor = ServidorFalso()..sesionVencida = true;
      final sesion = crearSesion(servidor, almacen: AlmacenMemoria()..datos['token'] = 'viejo');
      await sesion.restaurar();
      await montarApp(tester, sesion);
      expect(find.text('Ingresa tus credenciales para acceder'), findsOneWidget);
      expect(sesion.estado, EstadoSesion.sinSesion);
    });

    testWidgets('cerrar sesión descarta el token guardado', (tester) async {
      final servidor = ServidorFalso();
      final almacen = AlmacenMemoria();
      final sesion = crearSesion(servidor, almacen: almacen);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'administrador');
      expect(almacen.datos['token'], 'token-administrador');
      await tester.tap(find.byTooltip('Cuenta'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Salir'));
      await tester.pumpAndSettle();
      expect(almacen.datos.containsKey('token'), isFalse);
      expect(find.text('Ingresa tus credenciales para acceder'), findsOneWidget);
    });
  });

  group('administrador', () {
    testWidgets('ve todos los módulos, incluidos usuarios, carteras y base, y abre y cierra el día', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'administrador');

      for (final t in ['Nuevo', 'Inactivos', 'Todos', 'Enrutamiento', 'Adicionar', 'Consultar', 'Transacciones', 'Cierres', 'Simulador', 'Historial Notas', 'Base', 'Usuarios', 'Carteras']) {
        expect(opcion(t), findsOneWidget, reason: t);
      }
      expect(find.text('Registrar Pagos'), findsOneWidget);
      expect(find.text('Registrar Ventas'), findsOneWidget);
      expect(find.text('Día abierto'), findsOneWidget);
      expect(find.widgetWithText(OutlinedButton, 'Cerrar día'), findsOneWidget);
      expect(find.byTooltip('Cambiar de cartera'), findsOneWidget);
    });

    testWidgets('al cerrar el día pide confirmación y el servidor lo cierra', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'administrador');

      await tester.tap(find.widgetWithText(OutlinedButton, 'Cerrar día'));
      await tester.pumpAndSettle();
      expect(find.text('Cerrar el día'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Cerrar día'));
      await tester.pumpAndSettle();

      expect(servidor.peticiones.any((p) => p.metodo == 'POST' && p.ruta == '/api/v1/dia/cerrar'), isTrue);
      expect(find.text('Día cerrado'), findsWidgets);
      expect(find.widgetWithText(FilledButton, 'Abrir día'), findsOneWidget);
    });
  });

  group('supervisor', () {
    testWidgets('ve la información y abre y cierra el día, pero no crea clientes, gastos ni usuarios', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'supervisor');

      for (final t in ['Inactivos', 'Todos', 'Consultar', 'Transacciones', 'Cierres', 'Simulador', 'Historial Notas', 'Base']) {
        expect(opcion(t), findsOneWidget, reason: t);
      }
      expect(find.text('Registrar Pagos'), findsOneWidget, reason: 'el supervisor edita pagos');
      expect(find.widgetWithText(OutlinedButton, 'Cerrar día'), findsOneWidget);

      for (final t in ['Nuevo', 'Enrutamiento', 'Adicionar', 'Usuarios', 'Carteras']) {
        expect(opcion(t), findsNothing, reason: t);
      }
      expect(find.text('Registrar Ventas'), findsNothing);
    });
  });

  group('empleado', () {
    testWidgets('crea clientes y adiciona gastos y pagos; no gestiona el día, la base ni los usuarios', (tester) async {
      final servidor = ServidorFalso();
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'empleado');

      for (final t in ['Nuevo', 'Inactivos', 'Todos', 'Adicionar', 'Consultar', 'Transacciones', 'Cierres', 'Simulador', 'Historial Notas']) {
        expect(opcion(t), findsOneWidget, reason: t);
      }
      expect(find.text('Registrar Pagos'), findsOneWidget);

      for (final t in ['Enrutamiento', 'Usuarios', 'Carteras']) {
        expect(opcion(t), findsNothing, reason: t);
      }
      expect(find.text('Registrar Ventas'), findsNothing);
      expect(find.widgetWithText(OutlinedButton, 'Cerrar día'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Abrir día'), findsNothing);
      expect(find.byTooltip('Cambiar de cartera'), findsNothing, reason: 'solo ve su cartera');
    });

    testWidgets('con el día cerrado lo ve pero no puede abrirlo', (tester) async {
      final servidor = ServidorFalso(diaAbierto: false);
      final sesion = crearSesion(servidor);
      await sesion.restaurar();
      await montarApp(tester, sesion);
      await iniciarSesion(tester, 'empleado');
      expect(find.text('Día cerrado'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'Abrir día'), findsNothing);
    });
  });
}
