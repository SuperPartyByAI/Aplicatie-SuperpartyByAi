# Refactor Map - TITAN Architecture Migration

**Data**: 2025-01-27  
**Status**: PASUL 0 - Audit completat | PASUL 1 - În progres

---

## 📊 PASUL 0 - Audit Rapid

### Structura Actuală

```
lib/
├── models/          # Modele de date (EventModel, EvidenceModel, etc.)
├── services/        # Servicii business (EventService, FirebaseService, etc.)
├── screens/         # Ecrane UI (home, evenimente, admin, etc.)
├── widgets/         # Widget-uri reutilizabile
├── providers/       # State management (AppStateProvider)
└── utils/           # Utilitare
```

### Pattern-uri Identificate

#### ✅ Pozitive
- `EventService` are dependency injection parțială (opțională)
- Există `AppStateProvider` pentru state management centralizat
- Modele separate în `models/`
- Servicii separate în `services/`

#### ⚠️ Probleme Critice (Cuplaje Periculoase)

1. **Firebase Acces Direct în UI**
   - `main.dart`: `FirebaseService.auth.authStateChanges()`, `FirebaseService.firestore.collection('users')`
   - `evenimente_screen.dart`: `FirebaseFirestore.instance.collection('evenimente')` (linia 478)
   - `home_screen.dart`: `FirebaseAuth.instance.signOut()` (linia 45)
   - **14 fișiere** accesează `FirebaseAuth.instance` direct
   - **14 fișiere** accesează `FirebaseFirestore.instance` direct

2. **Routing Monolitic**
   - Switch mare în `main.dart` (linia 181-221)
   - Normalizare manuală de rute (`/#/evenimente` → `/evenimente`)
   - Auth gating în `AuthWrapper` (build loops)
   - Role gating distribuit în multiple locuri

3. **Servicii Statice/Singleton**
   - `FirebaseService` - static getters
   - `EventService` - instanțiat direct în screens (`_eventService = EventService()`)
   - Fără DI container centralizat

4. **Logică Business în UI**
   - `evenimente_screen.dart`: Filtrare client-side în build (linia 526-558)
   - `evenimente_screen.dart`: Logica de salvare direct în UI (linia 795-901)
   - `main.dart`: Auth logic în `AuthWrapper.build()` (linia 264-363)

5. **Stringly-Typed**
   - Rute ca string-uri hardcodate (`'/home'`, `'/evenimente'`)
   - Colecții Firestore ca string-uri (`'evenimente'`, `'users'`)
   - Status codes ca string-uri (`'kyc_required'`)

### Feature-uri Identificate

| Feature | Ecrane | Servicii | Status |
|---------|--------|----------|--------|
| **Auth** | `login_screen.dart` | `FirebaseService`, `RoleService` | ⚠️ Cuplaj direct |
| **Home** | `home_screen.dart` | `AppStateProvider` | ✅ OK |
| **Evenimente** | `evenimente_screen.dart` | `EventService` | ⚠️ Logică în UI |
| **Dovezi** | `dovezi_screen.dart` | `EvidenceService` | ⚠️ Cuplaj direct |
| **Disponibilitate** | `disponibilitate_screen.dart` | - | ⚠️ Cuplaj direct |
| **Salarizare** | `salarizare_screen.dart` | - | ⚠️ Cuplaj direct |
| **WhatsApp** | `whatsapp_screen.dart` | `WhatsAppService` | ⚠️ Cuplaj direct |
| **Team** | `team_screen.dart` | - | ⚠️ Cuplaj direct |
| **Admin** | `admin_screen.dart` | `RoleService` | ⚠️ Cuplaj direct |
| **KYC** | `kyc_screen.dart` | - | ⚠️ Cuplaj direct |
| **AI Chat** | `ai_chat_screen.dart` | `AICacheService`, `ChatCacheService` | 🔒 **PROTECTED** (read-only) |
| **GM** | `accounts_screen.dart`, etc. | - | ⚠️ Cuplaj direct |

### Zone Protejate (Read-Only)

- **AI Chat** (`lib/screens/ai_chat/`) - Are `README_PROTECTION.md`
  - **Acțiune**: Nu modifica logica, doar izolează dependențele în jurul ei

---

## 🗺️ Plan de Migrare (Ordine Optimă)

### Faza 1: Infrastructură (PASUL 1-3)
1. ✅ **PASUL 1**: Creează structura `core/` + `shared/` + `features/`
2. ⏳ **PASUL 2**: Dependency Injection (get_it sau riverpod)
3. ⏳ **PASUL 3**: Routing robust (go_router) + compatibilitate rute vechi

### Faza 2: Migrare Feature-uri (PASUL 4-6)
4. ⏳ **PASUL 4**: Clean boundaries - începe cu feature mic (ex: WhatsApp/Config)
5. ⏳ **PASUL 5**: Modele imutabile (freezed + json_serializable)
6. ⏳ **PASUL 6**: State management coerent

### Faza 3: Calitate & Teste (PASUL 7-9)
7. ⏳ **PASUL 7**: Teste (unit + widget)
8. ⏳ **PASUL 8**: CI GitHub Actions
9. ⏳ **PASUL 9**: Observabilitate + erori unificate

### Ordine de Migrare Feature-uri

**Prioritate 1 (Feature-uri Mici - Testare Pattern)**
1. **Config/Versiune** - Cel mai simplu, fără UI complex
2. **WhatsApp** - Serviciu izolat, logică clară

**Prioritate 2 (Feature-uri Medii)**
3. **Disponibilitate** - Logică simplă
4. **Team** - Logică simplă
5. **Salarizare** - Logică simplă

**Prioritate 3 (Feature-uri Complexe)**
6. **Evenimente** - Cel mai complex, multe dependențe
7. **Dovezi** - Complex, multe dependențe
8. **Admin** - Complex, multe dependențe
9. **GM** - Complex, multe dependențe

**Prioritate 4 (Auth & Core)**
10. **Auth** - Migrat la final (după ce DI e stabil)

**Protejat (Nu se modifică)**
- **AI Chat** - Doar izolare dependențe

---

## 📐 Diagramă Flux Actual (Before)

```
┌─────────────────────────────────────────────────────────────┐
│                        main.dart                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  FirebaseService.initialize() [STATIC]              │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  onGenerateRoute: switch(path) [MONOLITHIC]          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  AuthWrapper: StreamBuilder<User?>                    │   │
│  │    └─> FirebaseService.auth.authStateChanges()        │   │
│  │    └─> FirebaseService.firestore.collection('users')  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Screen (ex: EvenimenteScreen)            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  final EventService _eventService = EventService()   │   │
│  │  └─> FirebaseFirestore.instance [DIRECT]             │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  StreamBuilder<QuerySnapshot>                         │   │
│  │    └─> FirebaseFirestore.instance.collection(...)    │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  _saveAssignment() [BUSINESS LOGIC IN UI]            │   │
│  │    └─> FirebaseFirestore.instance.update()            │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Diagramă Flux Target (After)

```
┌─────────────────────────────────────────────────────────────┐
│                        main.dart                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DI.setup()                                          │   │
│  │    └─> registerSingleton<IFirebaseAuth>()            │   │
│  │    └─> registerSingleton<IFirestore>()               │   │
│  │    └─> registerFactory<EventRepository>()            │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  GoRouter (go_router)                                 │   │
│  │    └─> Route definitions (declarative)                 │   │
│  │    └─> Redirect guards (auth/role)                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              features/evenimente/presentation/              │
│                    EvenimenteScreen                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  final controller = get<EventController>() [DI]       │   │
│  │  └─> controller.eventsStream (observable)             │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  features/evenimente/application/                     │   │
│  │  EventController (ChangeNotifier)                     │   │
│  │    └─> GetEventsUseCase                               │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  features/evenimente/domain/                          │   │
│  │  EventRepository (interface)                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                 │
│                            ▼                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  features/evenimente/data/                           │   │
│  │  EventRepositoryImpl implements EventRepository     │   │
│  │    └─> IFirestore (injected)                          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔍 Metrici de Succes

- ✅ Zero acces direct la `FirebaseAuth.instance` / `FirebaseFirestore.instance` în UI
- ✅ Zero logică business în `build()` methods
- ✅ Toate rutele funcționează identic (deep links incluse)
- ✅ Teste pentru fiecare feature migrat
- ✅ CI verde pentru toate PR-urile
- ✅ Build verde după fiecare pas (`flutter analyze` + `flutter test`)

---

## 📝 Note de Implementare

### Constrainte
- Nu schimba funcționalitățile existente
- Refactor incremental (diffs mici)
- Nu rupe routing-ul existent
- AI Chat = read-only (doar izolare dependențe)

### Tehnologii Alese
- **DI**: `get_it` (mai simplu decât riverpod pentru început)
- **Routing**: `go_router` (standard Flutter, declarativ)
- **State**: `provider` (deja folosit) + `ChangeNotifier` în application layer
- **Models**: `freezed` + `json_serializable` (opțional, pentru modele noi)

---

**Next Steps**: PASUL 1 - Creează structura core/shared/features
