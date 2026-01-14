import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_flutter/providers/app_state_provider.dart';

void main() {
  test('AppStateProvider hard-blocks gm/admin mode when not superadmin', () {
    final appState = AppStateProvider(isSuperAdminGetter: () => false);

    expect(appState.isGmMode, false);
    expect(appState.isAdminMode, false);

    appState.setGmMode(true);
    appState.setAdminMode(true);

    expect(appState.isGmMode, false);
    expect(appState.isAdminMode, false);
  });

  test('AppStateProvider allows gm/admin mode when superadmin', () {
    final appState = AppStateProvider(isSuperAdminGetter: () => true);

    appState.setGmMode(true);
    appState.setAdminMode(true);

    expect(appState.isGmMode, true);
    expect(appState.isAdminMode, true);
  });
}

