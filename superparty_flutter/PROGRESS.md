# Progress - TITAN Architecture Migration

## ✅ PASUL 0 - Audit Rapid + Raport
**Status**: COMPLETAT

- [x] Audit structură actuală
- [x] Identificare cuplaje periculoase
- [x] Identificare feature-uri
- [x] Creare REFACTOR_MAP.md cu plan detaliat

**Rezultate**:
- 14 fișiere accesează `FirebaseAuth.instance` direct
- 14 fișiere accesează `FirebaseFirestore.instance` direct
- Routing monolitic în `main.dart`
- Logică business în UI (evenimente_screen.dart)
- AI Chat marcat ca PROTECTED (read-only)

---

## ✅ PASUL 1 - Structură core/shared/features
**Status**: COMPLETAT

- [x] Creat foldere `lib/core/` (di, routing, errors, logging, utils)
- [x] Creat foldere `lib/shared/` (widgets, theme)
- [x] Creat folder `lib/features/`
- [x] Adăugat dependențe: `get_it`, `go_router`
- [x] Documentat structura în README.md files

**Structură creată**:
```
lib/
├── core/
│   ├── di/          # Dependency Injection
│   ├── routing/     # Routing (go_router)
│   ├── errors/      # Error handling
│   ├── logging/     # Logging centralizat
│   └── utils/       # Utilitare generale
├── shared/
│   ├── widgets/     # Widget-uri reutilizabile
│   └── theme/       # Theme configuration
└── features/        # Feature-uri (Clean Architecture)
```

**Next**: PASUL 2 - Dependency Injection

---

## ⏳ PASUL 2 - Dependency Injection
**Status**: PENDING

**Plan**:
1. Creează `lib/core/di/injector.dart`
2. Wrap FirebaseService în interfețe (IFirebaseAuth, IFirestore)
3. Registrează servicii în get_it
4. Migrează un serviciu simplu ca exemplu

---

## ✅ PASUL 3 - Routing robust
**Status**: COMPLETAT (parțial - router creat, integrare pending)

- [x] go_router adăugat în pubspec.yaml
- [x] Creat `lib/core/routing/app_router.dart` cu toate rutele
- [x] Normalizare rute (/#/evenimente → /evenimente)
- [x] Păstrat AuthWrapper pentru ruta "/" (migrare incrementală)
- [ ] Integrare în main.dart (MaterialApp.router) - pending când DI e complet

**Notă**: Router-ul e pregătit, dar MaterialApp folosește încă onGenerateRoute pentru compatibilitate. Integrarea completă va fi făcută când DI e migrat complet.

---

## ⏳ PASUL 4-9
**Status**: PENDING

Vezi REFACTOR_MAP.md pentru detalii complete.

---

## 📝 Note

- Flutter nu e în PATH - `flutter analyze` și `flutter test` trebuie rulate manual
- AI Chat rămâne read-only (doar izolare dependențe)
- Toate schimbările sunt incrementale, cu build verde după fiecare pas
