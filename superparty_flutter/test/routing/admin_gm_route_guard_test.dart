import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:superparty_flutter/app/app_router.dart' as app_router;
import 'package:superparty_flutter/routing/app_router.dart' as routing_router;

void main() {
  test('app_router blocks /admin for non-superadmin', () {
    final route = app_router.onGenerateRoute(
      const RouteSettings(name: '/admin'),
    ) as MaterialPageRoute;
    expect(route.settings.name, '/evenimente');
  });

  test('app_router blocks /gm for non-superadmin', () {
    final route = app_router.onGenerateRoute(
      const RouteSettings(name: '/gm/accounts'),
    ) as MaterialPageRoute;
    expect(route.settings.name, '/evenimente');
  });

  test('routing_router blocks /admin for non-superadmin', () {
    final route = routing_router.onGenerateRoute(
      const RouteSettings(name: '/admin'),
    ) as MaterialPageRoute;
    expect(route.settings.name, '/evenimente');
  });

  test('routing_router blocks /gm for non-superadmin', () {
    final route = routing_router.onGenerateRoute(
      const RouteSettings(name: '/gm/accounts'),
    ) as MaterialPageRoute;
    expect(route.settings.name, '/evenimente');
  });
}

