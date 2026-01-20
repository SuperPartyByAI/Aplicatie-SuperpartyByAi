import 'package:flutter_test/flutter_test.dart';

import 'package:superparty_flutter/screens/whatsapp/whatsapp_chat_screen.dart';

void main() {
  test('getDisplayInitial returns fallback for empty strings', () {
    expect(getDisplayInitial(''), '?');
    expect(getDisplayInitial('   '), '?');
  });

  test('getDisplayInitial returns uppercase first letter', () {
    expect(getDisplayInitial('ana'), 'A');
    expect(getDisplayInitial('Bob'), 'B');
  });
}
