import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:superparty_flutter/widgets/update_gate.dart';

void main() {
  group('UpdateGate Widget Tests', () {
    testWidgets('UpdateGate does not throw Directionality error when checking',
        (WidgetTester tester) async {
      // Build UpdateGate in checking state
      await tester.pumpWidget(
        const UpdateGate(
          child: SizedBox.shrink(),
        ),
      );

      // Wait for initial check to complete
      await tester.pump(const Duration(milliseconds: 100));

      // Should not throw "No Directionality widget found" error
      expect(tester.takeException(), isNull);
    });

    testWidgets('UpdateGate renders child when no overlay needed',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: UpdateGate(
            child: Text('Test Child'),
          ),
        ),
      );

      // Wait for check to complete
      await tester.pumpAndSettle();

      // Child should be visible
      expect(find.text('Test Child'), findsOneWidget);
    });

    testWidgets('UpdateGate shows loading overlay during check',
        (WidgetTester tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: UpdateGate(
            child: Text('Test Child'),
          ),
        ),
      );

      // During initial check, loading should be visible
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Verificare actualizări...'), findsOneWidget);
    });

    testWidgets('UpdateGate has Directionality when showing overlay',
        (WidgetTester tester) async {
      // Build UpdateGate WITHOUT MaterialApp to test Directionality wrapper
      await tester.pumpWidget(
        const UpdateGate(
          child: SizedBox.shrink(),
        ),
      );

      // Should not throw error even without MaterialApp
      expect(tester.takeException(), isNull);

      // Directionality should be present
      expect(find.byType(Directionality), findsOneWidget);
    });
  });
}
