library injector;

/// Dependency Injection Container
/// 
/// Folosește get_it pentru gestionarea dependențelor.
/// Toate serviciile sunt înregistrate aici și accesate prin DI,
/// nu prin instanțiere directă sau singleton-uri statice.

import 'package:get_it/get_it.dart';

import '../../services/whatsapp_backfill_manager.dart';
import 'interfaces.dart';
import 'firebase_wrappers.dart';

final getIt = GetIt.instance;

/// Inițializează container-ul de dependențe
/// 
/// Trebuie apelat înainte de a folosi aplicația.
/// Se apelează în main.dart după FirebaseService.initialize()
Future<void> setupDependencyInjection() async {
  // Firebase wrappers (singleton - o instanță pentru toată aplicația)
  getIt.registerSingleton<IFirebaseAuth>(FirebaseAuthWrapper());
  getIt.registerSingleton<IFirestore>(FirestoreWrapper());

  // WhatsApp backfill (singleton)
  getIt.registerSingleton<WhatsAppBackfillManager>(WhatsAppBackfillManager.instance);

  // TODO: Adăugă registrări pentru:
  // - Repository-uri (factory - o instanță nouă per request)
  // - Use cases (factory)
  // - Controllers (factory sau lazy singleton)
}

/// Resetează container-ul (util în teste)
void resetDependencyInjection() {
  getIt.reset();
}
