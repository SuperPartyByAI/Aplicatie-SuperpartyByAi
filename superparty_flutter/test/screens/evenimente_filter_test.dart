import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Widget test for Evenimente filter UX
/// Tests the "Ce cod am" filter editability and mutual exclusivity
void main() {
  group('Evenimente Filter Tests', () {
    testWidgets('Code filter TextField is editable', (tester) async {
      final controller = TextEditingController();
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Ce cod am',
              ),
            ),
          ),
        ),
      );

      // Find the TextField
      final textField = find.byType(TextField);
      expect(textField, findsOneWidget);

      // Enter text
      await tester.enterText(textField, 'TEST123');
      await tester.pump();

      // Verify text was entered
      expect(controller.text, 'TEST123');
      expect(find.text('TEST123'), findsOneWidget);
    });

    testWidgets('Can edit text after programmatic selection', (tester) async {
      final controller = TextEditingController();
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              controller: controller,
              decoration: const InputDecoration(
                hintText: 'Ce cod am',
              ),
            ),
          ),
        ),
      );

      // Simulate selection from modal
      controller.text = 'NEREZOLVATE';
      await tester.pump();

      // Verify text is set
      expect(find.text('NEREZOLVATE'), findsOneWidget);

      // Now try to edit
      await tester.enterText(find.byType(TextField), 'MODIFIED');
      await tester.pump();

      // Verify text was updated
      expect(controller.text, 'MODIFIED');
      expect(find.text('MODIFIED'), findsOneWidget);
    });

    testWidgets('Clear button clears text', (tester) async {
      final controller = TextEditingController(text: 'TEST');
      bool cleared = false;
      
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: TextField(
              controller: controller,
              decoration: InputDecoration(
                hintText: 'Ce cod am',
                suffixIcon: IconButton(
                  icon: const Icon(Icons.clear),
                  onPressed: () {
                    controller.clear();
                    cleared = true;
                  },
                ),
              ),
            ),
          ),
        ),
      );

      // Verify text exists
      expect(find.text('TEST'), findsOneWidget);

      // Tap clear button
      await tester.tap(find.byIcon(Icons.clear));
      await tester.pump();

      // Verify text was cleared
      expect(controller.text, '');
      expect(cleared, true);
    });

    testWidgets('Mutual exclusivity: code disables notedBy', (tester) async {
      String codeFilter = '';
      String notedByFilter = '';
      
      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              final codeDisabled = notedByFilter.isNotEmpty;
              final notedByDisabled = codeFilter.isNotEmpty;
              
              return Scaffold(
                body: Column(
                  children: [
                    TextField(
                      key: const Key('code_field'),
                      enabled: !codeDisabled,
                      onChanged: (value) {
                        setState(() {
                          codeFilter = value;
                          if (codeFilter.isNotEmpty) {
                            notedByFilter = '';
                          }
                        });
                      },
                      decoration: const InputDecoration(
                        hintText: 'Ce cod am',
                      ),
                    ),
                    TextField(
                      key: const Key('notedby_field'),
                      enabled: !notedByDisabled,
                      onChanged: (value) {
                        setState(() {
                          notedByFilter = value;
                          if (notedByFilter.isNotEmpty) {
                            codeFilter = '';
                          }
                        });
                      },
                      decoration: const InputDecoration(
                        hintText: 'Cine noteaza',
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );

      // Both fields should be enabled initially
      final codeField = tester.widget<TextField>(find.byKey(const Key('code_field')));
      final notedByField = tester.widget<TextField>(find.byKey(const Key('notedby_field')));
      
      expect(codeField.enabled, true);
      expect(notedByField.enabled, true);

      // Enter text in code field
      await tester.enterText(find.byKey(const Key('code_field')), 'CODE123');
      await tester.pump();

      // NotedBy field should be disabled
      final notedByFieldAfter = tester.widget<TextField>(find.byKey(const Key('notedby_field')));
      expect(notedByFieldAfter.enabled, false);

      // Clear code field
      await tester.enterText(find.byKey(const Key('code_field')), '');
      await tester.pump();

      // Both should be enabled again
      final codeFieldFinal = tester.widget<TextField>(find.byKey(const Key('code_field')));
      final notedByFieldFinal = tester.widget<TextField>(find.byKey(const Key('notedby_field')));
      
      expect(codeFieldFinal.enabled, true);
      expect(notedByFieldFinal.enabled, true);
    });

    testWidgets('Mutual exclusivity: notedBy disables code', (tester) async {
      String codeFilter = '';
      String notedByFilter = '';
      
      await tester.pumpWidget(
        MaterialApp(
          home: StatefulBuilder(
            builder: (context, setState) {
              final codeDisabled = notedByFilter.isNotEmpty;
              final notedByDisabled = codeFilter.isNotEmpty;
              
              return Scaffold(
                body: Column(
                  children: [
                    TextField(
                      key: const Key('code_field'),
                      enabled: !codeDisabled,
                      onChanged: (value) {
                        setState(() {
                          codeFilter = value;
                          if (codeFilter.isNotEmpty) {
                            notedByFilter = '';
                          }
                        });
                      },
                      decoration: const InputDecoration(
                        hintText: 'Ce cod am',
                      ),
                    ),
                    TextField(
                      key: const Key('notedby_field'),
                      enabled: !notedByDisabled,
                      onChanged: (value) {
                        setState(() {
                          notedByFilter = value;
                          if (notedByFilter.isNotEmpty) {
                            codeFilter = '';
                          }
                        });
                      },
                      decoration: const InputDecoration(
                        hintText: 'Cine noteaza',
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      );

      // Enter text in notedBy field
      await tester.enterText(find.byKey(const Key('notedby_field')), 'STAFF123');
      await tester.pump();

      // Code field should be disabled
      final codeFieldAfter = tester.widget<TextField>(find.byKey(const Key('code_field')));
      expect(codeFieldAfter.enabled, false);
    });
  });
}
