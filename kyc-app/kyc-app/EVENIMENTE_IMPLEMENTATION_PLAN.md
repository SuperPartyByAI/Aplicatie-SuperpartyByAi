# EVENIMENTE IMPLEMENTATION PLAN

**Source HTML:** `/workspaces/Aplicatie-SuperpartyByAi/kyc-app/kyc-app/public/evenimente.html` (4522 lines)  
**Target:** Flutter implementation in `superparty_flutter/`  
**Spec:** `EVENIMENTE_SPEC_EXTRACTED.md`

---

## 1. FIȘIERE EXISTENTE (AUDIT)

### 1.1 Fișiere Principale
```
lib/screens/evenimente/
├── evenimente_screen.dart (858 linii) - ACTIV în main.dart
├── evenimente_screen_html.dart (856 linii) - versiune HTML (aproape identică)
├── event_card_html.dart (525 linii) - card component
├── dovezi_screen_html.dart (537 linii) - dovezi screen
├── event_details_sheet.dart (1117 linii) - sheet vechi (probabil nefolosit)
└── evenimente_screen_old_v1.dart (813 linii) - backup vechi
```

### 1.2 Fișiere Suport
```
lib/models/
├── event_model.dart - model Firestore
└── event_filters.dart - filter state

lib/services/
└── event_service.dart - Firestore operations

lib/widgets/
├── modals/ (dacă există)
└── event_edit_sheet.dart
```

---

## 2. STRATEGIE IMPLEMENTARE

### 2.1 Abordare
**NU recreez de la zero.** Folosesc fișierele existente și le corectez/completez conform HTML-ului.

**Pași:**
1. Compar `evenimente_screen.dart` cu spec HTML
2. Identific ce lipsește sau diferă
3. Corectez/completez fișierul activ
4. Verific că toate features din spec sunt implementate
5. Testez build + analyze

### 2.2 Fișiere de Modificat

**PRIORITATE 1 (CORE):**
1. `lib/screens/evenimente/evenimente_screen.dart` - ecran principal
2. `lib/screens/evenimente/event_card_html.dart` - card component
3. `lib/screens/evenimente/dovezi_screen_html.dart` - dovezi screen

**PRIORITATE 2 (MODALS):**
4. `lib/widgets/modals/range_modal.dart` - calendar picker (verifică dacă există)
5. `lib/widgets/modals/code_modal.dart` - code filter (verifică dacă există)
6. `lib/widgets/modals/assign_modal.dart` - role assignment (verifică dacă există)
7. `lib/widgets/modals/code_info_modal.dart` - code info (verifică dacă există)

**PRIORITATE 3 (MODELS/SERVICES):**
8. `lib/models/event_model.dart` - verifică schema Firestore
9. `lib/models/event_filters.dart` - verifică filter state
10. `lib/services/event_service.dart` - verifică Firestore ops

---

## 3. CHECKLIST IMPLEMENTARE (din SPEC)

### 3.1 AppBar & Filters
- [ ] Sticky AppBar cu backdrop blur
- [ ] Title "Evenimente" (18px, font-weight 900)
- [ ] **Row 1 Filters:**
  - [ ] Date preset dropdown (7 opțiuni)
  - [ ] Sort button (asc/desc toggle)
  - [ ] Driver filter button (4 states cyclic: all/yes/open/no)
- [ ] **Row 2 Filters:**
  - [ ] "Ce cod am" text input (150px, debounce)
  - [ ] Separator "–"
  - [ ] "Cine notează" text input (150px, debounce)
- [ ] Muted text: "Filtrele sunt exclusive (NU se combină)"

### 3.2 Modals
- [ ] **Range Modal:**
  - [ ] Calendar grid (6×7)
  - [ ] Prev/next month navigation
  - [ ] Day states: normal/selected/in-range/today/other-month
  - [ ] "Toate" (clear) + "Gata" (close) buttons
- [ ] **Code Modal:**
  - [ ] 4 buttons: "Scriu cod" / "Nerezolvate" / "Rezolvate" / "Toate"
  - [ ] Hint text
- [ ] **Assign Modal:**
  - [ ] Event info (ID, date, name, address)
  - [ ] Role info (slot, name)
  - [ ] Code input cu validare
  - [ ] Duplicate detection + swap hint
  - [ ] "Alocă" / "Șterge" / "Anulează" buttons
- [ ] **Code Info Modal:**
  - [ ] List all events cu cod
  - [ ] Event ID + date + slot + role
  - [ ] "Închide" button

### 3.3 Event Card
- [ ] **Badge Section (46px width):**
  - [ ] Vertical date (DD MMM)
  - [ ] Background gradient
  - [ ] Border
- [ ] **Main Section:**
  - [ ] Event ID + Date + Name
  - [ ] Address
  - [ ] Duration + Location
  - [ ] **Roles Grid (3 columns, slots A-J):**
    - [ ] Slot states: pending/assigned/unassigned
    - [ ] Colors: gray/teal/red
    - [ ] Show code sau "LIBER"
  - [ ] **Driver Slot S (full width):**
    - [ ] States: pending/yes/no
    - [ ] Colors: gray/teal/dark
    - [ ] Text: "NECESITĂ" / "NU"
- [ ] **Right Section:**
  - [ ] Chevron icon
- [ ] **Interactions:**
  - [ ] Click card → navigate to Dovezi
  - [ ] Click slot → open Assign modal

### 3.4 Dovezi Screen
- [ ] AppBar cu back button
- [ ] **4 Category Sections:**
  - [ ] Înainte de eveniment
  - [ ] În timpul evenimentului
  - [ ] După eveniment
  - [ ] Dovezi generale
- [ ] **Per Category:**
  - [ ] Title
  - [ ] Status pill (PENDING/APPROVED/REJECTED)
  - [ ] Photo grid (3 columns)
  - [ ] Upload button (multi-select)
  - [ ] "Reverifică" button (if locked)
- [ ] **Photo Item:**
  - [ ] Thumbnail
  - [ ] Delete button (× icon)
  - [ ] Click → preview full-screen
- [ ] **Verdict Logic:**
  - [ ] Click status pill → show options
  - [ ] Save to Firestore
  - [ ] Lock category if APPROVED
  - [ ] "Reverifică" unlocks

### 3.5 Filter Logic
- [ ] Date preset filtering (7 opțiuni)
- [ ] Custom range filtering (start + end)
- [ ] Sort (asc/desc)
- [ ] Driver filter (4 states)
- [ ] Code filter (user's code)
- [ ] NotedBy filter (creator)
- [ ] **IMPORTANT:** Filtrele sunt EXCLUSIVE (NU se combină)

### 3.6 Firestore Operations
- [ ] Stream `evenimente` collection
- [ ] Stream `evenimente/{id}/dovezi` subcollection
- [ ] Stream `evenimente/{id}/evidenceState/{category}` subcollection
- [ ] Save role assignment
- [ ] Save photo upload
- [ ] Save verdict
- [ ] **NEVER DELETE** - use `isArchived: true`

### 3.7 Validări
- [ ] Code format validation
- [ ] Duplicate code detection
- [ ] Photo upload validation (size, type, count)
- [ ] Verdict validation (min 2 photos)

---

## 4. PLAN EXECUȚIE (PAȘI CONCREȚI)

### PASUL 4.1: Audit Fișiere Existente
```bash
# Verifică ce există deja în evenimente_screen.dart
grep -n "datePreset\|sortDir\|driverFilter\|codeFilter\|notedByFilter" lib/screens/evenimente/evenimente_screen.dart

# Verifică modale existente
ls -la lib/widgets/modals/

# Verifică event_card_html.dart
grep -n "badge\|rolelist\|driver" lib/screens/evenimente/event_card_html.dart

# Verifică dovezi_screen_html.dart
grep -n "category\|upload\|verdict\|lock" lib/screens/evenimente/dovezi_screen_html.dart
```

### PASUL 4.2: Completare evenimente_screen.dart
**Ce trebuie adăugat/corectat:**
1. Driver filter button (4 states cyclic)
2. NotedBy filter input
3. Separator "–" între inputs
4. Muted text "Filtrele sunt exclusive"
5. Range modal integration
6. Code modal integration
7. Filter logic EXCLUSIVE (nu combinate)

### PASUL 4.3: Completare event_card_html.dart
**Ce trebuie adăugat/corectat:**
1. Badge section cu date vertical
2. Roles grid (3 columns)
3. Driver slot (full width, separate)
4. Slot states (pending/assigned/unassigned)
5. Click interactions

### PASUL 4.4: Completare dovezi_screen_html.dart
**Ce trebuie adăugat/corectat:**
1. 4 category sections
2. Status pills (3 states)
3. Photo grid (3 columns)
4. Upload button (multi-select)
5. Delete button per photo
6. Preview modal
7. Verdict logic + lock
8. "Reverifică" button

### PASUL 4.5: Creare/Verificare Modale
**Fișiere de creat (dacă nu există):**
1. `lib/widgets/modals/range_modal.dart`
2. `lib/widgets/modals/code_modal.dart`
3. `lib/widgets/modals/assign_modal.dart`
4. `lib/widgets/modals/code_info_modal.dart`

### PASUL 4.6: Verificare Models & Services
**Verifică schema Firestore:**
- `event_model.dart` - date format DD-MM-YYYY, roles structure
- `event_filters.dart` - toate filtrele din spec
- `event_service.dart` - stream operations, NEVER DELETE

### PASUL 4.7: Build & Test
```bash
cd superparty_flutter
flutter pub get
flutter analyze
flutter test
flutter build web --release
```

---

## 5. STRUCTURĂ FOLDERE (FINALĂ)

```
lib/
├── main.dart (rută '/evenimente')
├── models/
│   ├── event_model.dart
│   ├── event_filters.dart
│   └── dovezi_model.dart (dacă nu există)
├── services/
│   └── event_service.dart
├── screens/
│   └── evenimente/
│       ├── evenimente_screen.dart (ACTIV)
│       ├── event_card_html.dart
│       ├── dovezi_screen_html.dart
│       └── (backup files - ignore)
└── widgets/
    ├── modals/
    │   ├── range_modal.dart
    │   ├── code_modal.dart
    │   ├── assign_modal.dart
    │   └── code_info_modal.dart
    └── (alte widgets comune)
```

---

## 6. STATE MANAGEMENT

**Provider/Riverpod (conform proiectului existent):**

```dart
// Filter state
class FilterState {
  String datePreset; // 'all', 'today', 'yesterday', 'last7', 'next7', 'next30', 'custom'
  DateTime? customStart;
  DateTime? customEnd;
  bool sortAsc; // true = asc, false = desc
  String driverFilter; // 'all', 'yes', 'open', 'no'
  String codeFilter;
  String notedByFilter;
}

// Events stream
StreamProvider<List<EventModel>> eventsStream;

// Dovezi stream per event
StreamProvider<List<DoveziModel>> doveziStream(String eventId);

// Evidence state stream per event
StreamProvider<Map<String, EvidenceState>> evidenceStateStream(String eventId);
```

---

## 7. DESIGN TOKENS (FLUTTER)

```dart
class AppColors {
  static const bg = Color(0xFF0B1220);
  static const bg2 = Color(0xFF111C35);
  static const text = Color(0xFFEAF1FF);
  static const muted = Color(0xB3EAF1FF); // 70% opacity
  static const muted2 = Color(0x94EAF1FF); // 58% opacity
  static const border = Color(0x1FFFFFFF); // 12% opacity
  static const card = Color(0x0FFFFFFF); // 6% opacity
  static const accent = Color(0xFF4ECDC4);
  static const warn = Color(0xFFFFBE5C);
  static const bad = Color(0xFFFF7878);
}

class AppGradients {
  static const background = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [AppColors.bg2, AppColors.bg],
  );
  
  // Radial gradients - use Stack cu Positioned
}
```

---

## 8. CONSTRÂNGERI

1. **NU schimb arhitectura proiectului** - folosesc Provider/Riverpod existent
2. **NU recreez de la zero** - corectez/completez fișierele existente
3. **NU simplific** - implementez EXACT conform HTML
4. **NU omit features** - toate din spec trebuie implementate
5. **NEVER DELETE** - folosesc `isArchived: true` peste tot

---

## 9. GATE FINAL (ÎNAINTE DE PASUL 5)

**NU trec la PASUL 5 (Verificare) până când:**
- [ ] Toate checkbox-urile din Secțiunea 3 sunt bifate
- [ ] `flutter analyze` returnează 0 issues
- [ ] `flutter build web --release` reușește
- [ ] Toate fișierele modificate sunt listate
- [ ] Git diff arată modificările

---

**NEXT:** Execut PASUL 4 (Implementare 1:1)

