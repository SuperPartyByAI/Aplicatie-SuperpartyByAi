# Evenimente + Dovezi - Progres Implementare

## ✅ Completat

### 1. Schema de Date
- ✅ Documentație completă în `EVENIMENTE_DOVEZI_SCHEMA.md`
- ✅ Structură Firestore definită
- ✅ Structură Storage definită
- ✅ Schema SQLite pentru cache local
- ✅ Reguli de securitate documentate

### 2. Modele (100% Complete)
- ✅ `lib/models/event_model.dart`
  - EventModel cu toate câmpurile
  - RoleAssignment + AssignmentStatus enum
  - DriverAssignment + DriverStatus enum
  - Metode fromFirestore/toFirestore
  - copyWith pentru immutability

- ✅ `lib/models/evidence_model.dart`
  - EvidenceModel pentru dovezi remote
  - EvidenceCategory enum cu 4 categorii
  - EvidenceCategoryMeta pentru lock status
  - LocalEvidence pentru cache local
  - SyncStatus enum (pending/synced/failed)

- ✅ `lib/models/event_filters.dart`
  - EventFilters cu toate opțiunile
  - DatePreset enum (Today, This week, etc.)
  - SortBy + SortDirection enums
  - Logică dateRange calculată
  - hasActiveFilters + activeFilterCount

### 3. Utils
- ✅ `lib/utils/event_utils.dart`
  - Funcție pură `requiresSofer()`
  - Logică bazată pe tipEveniment + tipLocatie

### 4. Teste
- ✅ `test/utils/event_utils_test.dart`
  - 5 test suites pentru requiresSofer
  - Coverage: exterior locations, interior locations, online events, edge cases, comprehensive

### 5. Servicii (100% Complete)
- ✅ `lib/services/event_service.dart`
  - getEventsStream() cu filtre server-side + client-side
  - getEvent() pentru un eveniment specific
  - updateRoleAssignment() pentru alocări
  - updateDriverAssignment() pentru șofer
  - updateRequiresSofer() pentru recalculare
  - createEvent() + deleteEvent()

- ✅ `lib/services/evidence_service.dart`
  - uploadEvidence() cu verificare lock
  - getEvidenceStream() + getEvidenceList()
  - deleteEvidence() cu verificare lock
  - lockCategory() + unlockCategory()
  - getCategoryMeta() + getCategoryMetaStream()
  - _updateCategoryPhotoCount() helper

- ✅ `lib/services/local_evidence_cache_service.dart`
  - SQLite database init
  - insertPending() pentru cache local
  - listByEventAndCategory() + listPending() + listFailed()
  - markSynced() + markFailed()
  - deleteById() + cleanup methods
  - getCountByStatus() pentru statistici

- ✅ `lib/services/file_storage_service.dart`
  - getEventCategoryPath() pentru organizare fișiere
  - saveLocalFile() + deleteLocalFile()
  - fileExists() + getFileSize()
  - deleteEventFiles() + cleanupOldFiles()
  - getTotalCacheSize() pentru monitoring

---

## 🔄 În Progres / Urmează

### 6. Servicii Rămase

#### `lib/services/evidence_service.dart`
```dart
class EvidenceService {
  // Upload imagine în Storage + Firestore
  Future<String> uploadEvidence({
    required String eventId,
    required EvidenceCategory categorie,
    required File imageFile,
  });
  
  // Fetch dovezi pentru un eveniment + categorie
  Stream<List<EvidenceModel>> getEvidenceStream({
    required String eventId,
    EvidenceCategory? categorie,
  });
  
  // Șterge dovadă
  Future<void> deleteEvidence({
    required String eventId,
    required String evidenceId,
    required String storagePath,
  });
  
  // Lock/unlock categorie
  Future<void> lockCategory({
    required String eventId,
    required EvidenceCategory categorie,
  });
  
  Future<void> unlockCategory({
    required String eventId,
    required EvidenceCategory categorie,
  });
  
  // Obține metadata categorie
  Future<EvidenceCategoryMeta> getCategoryMeta({
    required String eventId,
    required EvidenceCategory categorie,
  });
  
  Stream<EvidenceCategoryMeta> getCategoryMetaStream({
    required String eventId,
    required EvidenceCategory categorie,
  });
}
```

#### `lib/services/local_evidence_cache_service.dart`
```dart
class LocalEvidenceCacheService {
  static Database? _database;
  
  // Init DB
  static Future<Database> get database;
  static Future<Database> _initDatabase();
  
  // CRUD operations
  Future<void> insertPending(LocalEvidence evidence);
  Future<List<LocalEvidence>> listByEventAndCategory({
    required String eventId,
    required EvidenceCategory categorie,
  });
  Future<List<LocalEvidence>> listPending();
  Future<void> markSynced({
    required String id,
    required String remoteUrl,
    required String remoteDocId,
  });
  Future<void> markFailed({
    required String id,
    required String errorMessage,
  });
  Future<void> deleteById(String id);
  Future<void> incrementRetryCount(String id);
}
```

#### `lib/services/file_storage_service.dart`
```dart
class FileStorageService {
  // Obține path local pentru event/categorie
  Future<String> getEventCategoryPath({
    required String eventId,
    required EvidenceCategory categorie,
  });
  
  // Salvează fișier local
  Future<String> saveLocalFile({
    required File sourceFile,
    required String eventId,
    required EvidenceCategory categorie,
  });
  
  // Șterge fișier local
  Future<void> deleteLocalFile(String path);
  
  // Verifică dacă fișierul există
  Future<bool> fileExists(String path);
}
```

### 7. UI - Evenimente

#### Extindere `lib/screens/evenimente/evenimente_screen.dart`
- Adaugă bottom sheet pentru filtre avansate
- Implementează DateRangePicker pentru custom range
- Afișează chip-uri pentru filtre active
- Buton "Reset filtre"
- Navigare către EventDetailsSheet

#### Nou: `lib/screens/evenimente/event_details_sheet.dart`
```dart
class EventDetailsSheet extends StatefulWidget {
  final String eventId;
  
  // UI:
  // - Header cu nume eveniment + dată
  // - Secțiune "Alocări" cu listă roluri
  // - Per rol: dropdown user + buton assign/unassign
  // - Secțiune "Șofer" (conditional pe requiresSofer)
  // - Buton "Vezi Dovezi" → navigare DoveziScreen
}
```

### 8. UI - Dovezi

#### Nou: `lib/screens/dovezi/dovezi_screen.dart`
```dart
class DoveziScreen extends StatefulWidget {
  final String eventId;
  
  // UI:
  // - Header cu nume eveniment
  // - 4 categorii (Mâncare, Băutură, Scenotehnică, Altele)
  // - Per categorie:
  //   - Grid thumbnails (local + remote)
  //   - Badge "Blocat ✓" dacă locked
  //   - Buton "Adaugă" (disabled dacă locked)
  //   - Buton "Marchează OK" (disabled dacă locked sau nu există poze)
  //   - Delete per poză (disabled dacă locked)
  // - Buton "Sincronizează" pentru retry failed uploads
  // - Progress indicators pentru uploads în curs
}
```

#### Componente helper:
- `lib/widgets/evidence_category_card.dart`
- `lib/widgets/evidence_thumbnail.dart`
- `lib/widgets/evidence_upload_progress.dart`

### 9. Teste

#### `test/models/event_filters_test.dart`
- Test dateRange pentru toate preset-urile
- Test hasActiveFilters
- Test activeFilterCount
- Test copyWith + reset

#### `test/services/event_service_test.dart`
- Mock Firestore + Auth
- Test getEventsStream cu filtre
- Test updateRoleAssignment
- Test updateDriverAssignment

#### Widget tests:
- `test/widgets/event_details_sheet_test.dart`
- `test/widgets/dovezi_screen_test.dart`

### 10. Documentație

- README cu instrucțiuni setup
- Indexuri Firestore necesare
- Pași testare manuală

---

## 📋 Checklist Final

- [ ] EvidenceService implementat
- [ ] LocalEvidenceCacheService implementat
- [ ] FileStorageService implementat
- [ ] EvenimenteScreen extins cu filtre complete
- [ ] EventDetailsSheet implementat
- [ ] DoveziScreen implementat
- [ ] Widget-uri helper pentru dovezi
- [ ] Teste pentru modele
- [ ] Teste pentru servicii
- [ ] Widget tests minimal
- [ ] flutter analyze pass
- [ ] flutter test pass
- [ ] Documentație completă
- [ ] Testare manuală end-to-end

---

## 🚀 Comenzi Utile

```bash
# Rulează toate testele
cd superparty_flutter && flutter test

# Rulează teste specifice
flutter test test/utils/event_utils_test.dart

# Analiză cod
flutter analyze

# Build APK
flutter build apk --release

# Verifică coverage
flutter test --coverage
```

---

## 📝 Note Implementare

1. **Null-safety**: Toate modelele sunt null-safe
2. **Error handling**: Toate serviciile aruncă excepții cu mesaje clare
3. **Optimistic UI**: Dovezile apar imediat după selecție (cache local)
4. **Offline-first**: Dovezile se salvează local și se sincronizează când există conectivitate
5. **Lock enforcement**: Verificare server-side în Firestore rules + client-side în UI
6. **Immutability**: Toate modelele au copyWith pentru state management
7. **Testability**: Serviciile acceptă dependencies injectate pentru testing

---

## ⚠️ Atenție

- **Indexuri Firestore**: Vor fi necesare pentru query-uri complexe (vezi EVENIMENTE_DOVEZI_SCHEMA.md)
- **Storage rules**: Verifică că sunt configurate corect pentru upload
- **Permissions**: Verifică că utilizatorii au permisiuni corecte în Firestore
- **Cleanup**: Implementează ștergere dovezi când se șterge un eveniment
