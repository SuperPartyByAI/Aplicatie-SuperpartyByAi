/// Dependency Injection Container
/// 
/// Folosește get_it pentru gestionarea dependențelor.
/// Toate serviciile sunt înregistrate aici și accesate prin DI,
/// nu prin instanțiere directă sau singleton-uri statice.

import 'package:flutter/foundation.dart' show debugPrint;
import 'package:get_it/get_it.dart';
import 'interfaces.dart';
import 'firebase_wrappers.dart';

final getIt = GetIt.instance;

/// Inițializează container-ul de dependențe
/// 
/// Trebuie apelat înainte de a folosi aplicația.
/// Se apelează în main.dart după FirebaseService.initialize()
/// Safe to call multiple times (idempotent - checks if already registered)
Future<void> setupDependencyInjection() async {
  // Guard: nu reînregistra dacă e deja inițializat
  if (getIt.isRegistered<IFirebaseAuth>() || getIt.isRegistered<IFirestore>()) {
    debugPrint('[DI] Already initialized, skipping');
    return;
  }

  // Firebase wrappers (singleton - o instanță pentru toată aplicația)
  getIt.registerSingleton<IFirebaseAuth>(FirebaseAuthWrapper());
  getIt.registerSingleton<IFirestore>(FirestoreWrapper());

  // TODO: Adăugă registrări pentru:
  // - Repository-uri (factory - o instanță nouă per request)
  // - Use cases (factory)
  // - Controllers (factory sau lazy singleton)
}

/// Resetează container-ul (util în teste)
void resetDependencyInjection() {
  getIt.reset();
}
