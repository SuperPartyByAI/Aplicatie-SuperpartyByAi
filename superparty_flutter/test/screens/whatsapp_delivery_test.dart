import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_app/screens/whatsapp/whatsapp_delivery.dart';

void main() {
  test('delivery icon mapping', () {
    expect(deliveryIconData('queued'), null);
    expect(deliveryIconData('sent'), Icons.check);
    expect(deliveryIconData('delivered'), Icons.done_all);
    expect(deliveryIconData('read'), Icons.done_all);
    expect(deliveryIconData('failed'), Icons.error_outline);
  });

  test('delivery color mapping', () {
    expect(deliveryIconColor('queued'), null);
    expect(deliveryIconColor('sent'), Colors.black54);
    expect(deliveryIconColor('delivered'), Colors.black54);
    expect(deliveryIconColor('read'), Colors.blue);
    expect(deliveryIconColor('failed'), Colors.red);
  });
}

