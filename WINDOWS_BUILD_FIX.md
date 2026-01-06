# Windows Build Fix - Aplicație SuperParty

## PROBLEMA

Build-ul Flutter pe Windows eșuează cu erori Dart în:
- `evenimente_screen.dart` - sintaxă invalidă (paranteze/liste neînchise)
- `dovezi_screen.dart` - parametru `category` inexistent
- `evidence_service.dart` - parametru `categorie` inexistent + `copyWith` lipsă

## CAUZA

Versiunea locală NU conține fix-urile din PR #20 care au reparat aceste erori.

## SOLUȚIE

### Opțiunea 1: Pull ultimele schimbări (RECOMANDAT)

```powershell
cd C:\Users\ursac\Aplicatie-SuperpartyByAi_clean
git fetch origin
git checkout fix/ai-chat-region-and-key-handling
git pull origin fix/ai-chat-region-and-key-handling
```

Apoi:
```powershell
cd superparty_flutter
flutter clean
flutter pub get
flutter analyze
flutter run -d windows
```

### Opțiunea 2: Aplică patch-urile manual

Dacă nu poți face pull, aplică următoarele fix-uri:

---

## FIX 1: evenimente_screen.dart - Elimină blocul orfan

**Fișier:** `lib/screens/evenimente/evenimente_screen.dart`

**Problema:** Există un bloc de proprietăți `style:` și `decoration:` care nu aparține niciunui widget (liniile ~348-365 în versiunea ta).

**Fix:** Șterge liniile care conțin:
```dart
        ),
            style: const TextStyle(color: Color(0xFFEAF1FF)),
            decoration: InputDecoration(
              hintText: 'Ce cod am',
              hintStyle: const TextStyle(color: Color(0x8CEAF1FF)),
              filled: true,
              fillColor: (_notedBy == null || _notedBy!.isEmpty) ? const Color(0x14FFFFFF) : const Color(0x08FFFFFF),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x1FFFFFFF)),
              ),
              disabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: Color(0x0AFFFFFF)),
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            ),
          ),
        ),
```

Aceste linii apar DUPĂ primul `Expanded` se închide și ÎNAINTE de `Padding`. Ele trebuie eliminate complet.

**Verificare:**
```powershell
flutter format lib/screens/evenimente/evenimente_screen.dart
flutter analyze
```

---

## FIX 2: Standardizare parametru category/categorie

### 2A: evidence_service.dart

**Fișier:** `lib/services/evidence_service.dart`

**Schimbări necesare:**

1. **Linia ~39** - Schimbă parametrul de la `categorie` la `category`:
```dart
// ÎNAINTE:
Future<EvidenceUploadResult> uploadEvidence({
  required String eventId,
  required EvidenceCategory categorie,
  required File imageFile,
}) async {

// DUPĂ:
Future<EvidenceUploadResult> uploadEvidence({
  required String eventId,
  required EvidenceCategory category,
  required File imageFile,
}) async {
```

2. **Toate referințele la `categorie` în funcție** - Înlocuiește cu `category`:
   - Linia ~51: `categorie: categorie,` → `categorie: category,`
   - Linia ~59: `${categorie.value}` → `${category.value}`
   - Linia ~74: `categorie: categorie,` → `categorie: category,`
   - Linia ~91: `categorie, increment: true` → `category, increment: true`

3. **Repetă pentru toate funcțiile:**
   - `getEvidenceStream` (linia ~107)
   - `getArchivedEvidenceStream` (linia ~133)
   - `getEvidenceList` (linia ~158)
   - `archiveEvidence` (linia ~191)
   - `unarchiveEvidence` (linia ~234)
   - `lockCategory` (linia ~262)
   - `unlockCategory` (linia ~301)
   - `getCategoryMeta` (linia ~339)
   - `getCategoryMetaStream` (linia ~368)
   - `_updateCategoryPhotoCount` (linia ~384)

**Căutare și înlocuire globală:**
```
Caută: required EvidenceCategory categorie
Înlocuiește cu: required EvidenceCategory category

Caută: EvidenceCategory categorie,
Înlocuiește cu: EvidenceCategory category,

Caută: EvidenceCategory? categorie
Înlocuiește cu: EvidenceCategory? category
```

### 2B: dovezi_screen.dart

**Fișier:** `lib/screens/dovezi/dovezi_screen.dart`

**Linia ~290** - Apelul `uploadEvidence`:
```dart
// ÎNAINTE:
await _evidenceService.uploadEvidence(
  eventId: widget.eventId,
  category: category,  // ← Parametrul se numește 'category' dar funcția așteaptă 'categorie'
  filePath: image.path,
);

// DUPĂ (dacă ai standardizat la 'category'):
await _evidenceService.uploadEvidenceFromPath(
  eventId: widget.eventId,
  category: category,
  filePath: image.path,
);
```

**Linia ~320** - Apelul `archiveEvidence`:
```dart
// ÎNAINTE:
await _evidenceService.archiveEvidence(
  eventId: widget.eventId,
  evidenceId: evidence.id,
  category: evidence.category,  // ← Parametrul se numește 'category'
);

// DUPĂ:
await _evidenceService.archiveEvidence(
  eventId: widget.eventId,
  evidenceId: evidence.id,
  category: evidence.category,  // OK dacă ai standardizat la 'category'
);
```

---

## FIX 3: EvidenceStateModel.copyWith

**Fișier:** `lib/models/evidence_state_model.dart`

**Problema:** Clasa `EvidenceStateModel` nu are metoda `copyWith`.

**Fix:** Adaugă metoda `copyWith` în clasa `EvidenceStateModel`:

```dart
class EvidenceStateModel {
  final String id;
  final EvidenceCategory category;
  final EvidenceStatus status;
  final bool locked;
  final DateTime updatedAt;
  final String updatedBy;

  EvidenceStateModel({
    required this.id,
    required this.category,
    required this.status,
    required this.locked,
    required this.updatedAt,
    required this.updatedBy,
  });

  // ADAUGĂ ACEASTĂ METODĂ:
  EvidenceStateModel copyWith({
    String? id,
    EvidenceCategory? category,
    EvidenceStatus? status,
    bool? locked,
    DateTime? updatedAt,
    String? updatedBy,
  }) {
    return EvidenceStateModel(
      id: id ?? this.id,
      category: category ?? this.category,
      status: status ?? this.status,
      locked: locked ?? this.locked,
      updatedAt: updatedAt ?? this.updatedAt,
      updatedBy: updatedBy ?? this.updatedBy,
    );
  }

  // ... restul metodelor (fromFirestore, toFirestore, etc.)
}
```

**SAU** - Dacă `unlockCategory` folosește `copyWith` cu parametri care nu există (ex: `lockedBy`, `lockedAt`), modifică apelul:

**În `evidence_service.dart`, funcția `unlockCategory`:**
```dart
// ÎNAINTE (dacă ai așa ceva):
final meta = currentMeta.copyWith(
  locked: false,
  lockedBy: null,
  lockedAt: null,
  lastUpdated: DateTime.now(),
);

// DUPĂ:
final meta = EvidenceStateModel(
  id: category.value,
  category: category,
  status: currentMeta.status,
  locked: false,
  updatedAt: DateTime.now(),
  updatedBy: currentUser.uid,
);
```

---

## FIX 4: evidence_model.dart - Dual write/read

**Fișier:** `lib/models/evidence_model.dart`

Asigură-te că modelul suportă atât `category` cât și `categorie` (backward compatibility):

```dart
factory EvidenceModel.fromFirestore(DocumentSnapshot doc, String eventId) {
  final data = doc.data() as Map<String, dynamic>;
  
  // Backward compatibility: read from 'category' or fallback to 'categorie'
  final categoryValue = (data['category'] as String?) ?? 
                        (data['categorie'] as String?) ?? 
                        'onTime';
  
  return EvidenceModel(
    id: doc.id,
    eventId: eventId,
    category: EvidenceCategory.fromString(categoryValue),
    // ... rest of fields
  );
}

Map<String, dynamic> toFirestore() {
  return {
    'category': category.value,
    'categorie': category.value, // Backward compatibility during migration
    // ... rest of fields
  };
}
```

---

## VERIFICARE FINALĂ

După aplicarea tuturor fix-urilor:

```powershell
cd C:\Users\ursac\Aplicatie-SuperpartyByAi_clean\superparty_flutter

# 1. Curăță build-ul
flutter clean

# 2. Obține dependențele
flutter pub get

# 3. Verifică erorile
flutter analyze

# 4. Rulează pe Windows
flutter run -d windows
```

**Rezultat așteptat:**
- `flutter analyze` → 0 erori
- `flutter run -d windows` → Aplicația pornește

---

## COMMIT RECOMANDAT

```
Fix Windows build: evenimente syntax + evidence params + copyWith

- Remove orphan style/decoration block in evenimente_screen.dart
- Standardize category parameter naming across evidence stack
- Add copyWith method to EvidenceStateModel
- Implement dual-write for category/categorie fields

Fixes compilation errors:
- Can't find ']' to match '['
- The getter 'style' isn't defined
- No named parameter 'category'/'categorie'
- The method 'copyWith' isn't defined
```

---

## FIȘIERE MODIFICATE

1. `lib/screens/evenimente/evenimente_screen.dart` - Șters bloc orfan
2. `lib/screens/dovezi/dovezi_screen.dart` - Standardizat parametri
3. `lib/services/evidence_service.dart` - Standardizat parametri
4. `lib/models/evidence_state_model.dart` - Adăugat copyWith
5. `lib/models/evidence_model.dart` - Dual write/read

---

## NOTĂ IMPORTANTĂ

Toate aceste fix-uri sunt deja aplicate în branch-ul `fix/ai-chat-region-and-key-handling` din repository.

**Cea mai simplă soluție:** Pull branch-ul și rebuild.
