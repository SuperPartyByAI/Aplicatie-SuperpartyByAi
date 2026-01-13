import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_flutter/routing/route_guards.dart';

void main() {
  test('non-superadmin should be redirected from /admin/*', () {
    expect(
      shouldRedirectToEvenimente(path: '/admin', email: 'x@example.com'),
      true,
    );
    expect(
      shouldRedirectToEvenimente(path: '/admin/ai-logic', email: 'x@example.com'),
      true,
    );
  });

  test('non-superadmin should be redirected from /gm/*', () {
    expect(
      shouldRedirectToEvenimente(path: '/gm/accounts', email: 'x@example.com'),
      true,
    );
  });

  test('superadmin is NOT redirected from /admin/* and /gm/*', () {
    expect(
      shouldRedirectToEvenimente(path: '/admin', email: 'ursache.andrei1995@gmail.com'),
      false,
    );
    expect(
      shouldRedirectToEvenimente(path: '/gm/accounts', email: 'ursache.andrei1995@gmail.com'),
      false,
    );
  });
}

