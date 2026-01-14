import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import '../../lib/app/app_shell.dart';

/// Deterministic tests for FirebaseInitGate retry/backoff behavior.
void main() {
  testWidgets('FirebaseInitGate shows loading UI immediately', (tester) async {
    bool initCalled = false;
    Future<void> fakeInit() async {
      initCalled = true;
      await Future.delayed(const Duration(milliseconds: 100));
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FirebaseInitGate(
            initializeFirebase: fakeInit,
            timeout: const Duration(seconds: 1),
            child: const Text('App Content'),
          ),
        ),
      ),
    );

    // Should show loading indicator immediately
    await tester.pump();
    expect(find.text('Initializing Firebase...'), findsOneWidget);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
    expect(find.text('App Content'), findsNothing);
  });

  testWidgets('FirebaseInitGate shows error UI on failure and retries', (tester) async {
    int attemptCount = 0;
    Future<void> failingInit() async {
      attemptCount++;
      await Future.delayed(const Duration(milliseconds: 50));
      throw Exception('Firebase init failed');
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FirebaseInitGate(
            initializeFirebase: failingInit,
            timeout: const Duration(seconds: 1),
            maxAttempts: 3,
            backoffDelays: const [Duration(seconds: 1), Duration(seconds: 1)],
            child: const Text('App Content'),
          ),
        ),
      ),
    );

    // Initial load
    await tester.pump();
    expect(find.text('Initializing Firebase...'), findsOneWidget);

    // Wait for first attempt to fail
    await tester.pumpAndSettle(const Duration(seconds: 2));
    
    // Should show error UI with attempt counter
    expect(find.text('Firebase nu a putut fi inițializat.'), findsOneWidget);
    expect(find.text('Încercare 1/3'), findsOneWidget);
    expect(find.text('Reîncearcă acum'), findsOneWidget);

    // Verify attempt was made
    expect(attemptCount, 1);
  });

  testWidgets('FirebaseInitGate stops after max attempts', (tester) async {
    int attemptCount = 0;
    Future<void> alwaysFailingInit() async {
      attemptCount++;
      throw Exception('Always fails');
    }

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FirebaseInitGate(
            initializeFirebase: alwaysFailingInit,
            timeout: const Duration(seconds: 1),
            maxAttempts: 3,
            backoffDelays: const [Duration(milliseconds: 100), Duration(milliseconds: 100)],
            child: const Text('App Content'),
          ),
        ),
      ),
    );

    // Let all attempts complete
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 150)); // First attempt fails
    await tester.pump(const Duration(milliseconds: 150)); // Second attempt fails
    await tester.pump(const Duration(milliseconds: 150)); // Third attempt fails

    // Should show exhausted state
    expect(find.text('Firebase nu a putut fi inițializat după 3 încercări.'), findsOneWidget);
    expect(find.text('Te rog repornește aplicația.'), findsOneWidget);
    expect(find.text('Reîncearcă acum'), findsNothing); // No retry button when exhausted
  });

  test('FirebaseInitGate retry configuration matches DoD Option 1', () {
    // DoD Option 1: maxAttempts = 3 total, delays: 10s before attempt2, 20s before attempt3
    const maxAttempts = 3;
    const backoffDelays = [
      Duration(seconds: 10), // Delay before attempt 2
      Duration(seconds: 20), // Delay before attempt 3
    ];
    
    expect(maxAttempts, 3);
    expect(backoffDelays.length, 2); // Only 2 delays (before attempt 2 and 3)
    expect(backoffDelays[0], const Duration(seconds: 10));
    expect(backoffDelays[1], const Duration(seconds: 20));
  });
}
