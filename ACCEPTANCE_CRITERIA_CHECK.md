# Acceptance Criteria - Evenimente + Dovezi

## ✅ Verificare Completă

### 1. EvenimenteScreen folosește EventService + EventFilters
- ✅ Import `EventService` și `EventFilters`
- ✅ State: `EventFilters _filters = EventFilters()`
- ✅ Stream: `_eventService.getEventsStream(_filters)`
- ✅ Preset-uri dată: all, today, thisWeek, thisMonth
- ✅ Custom range: `showDateRangePicker()` → `customStartDate/customEndDate`
- ✅ Search bar: `_filters.copyWith(searchQuery: value)`
- ✅ Filtre avansate: sortBy, sortDirection, requiresSofer, assignedToMe
- ✅ Badge filtre active: `${_filters.activeFilterCount} filtre active`
- ✅ Reset filtre: `_filters.reset()`

### 2. Tap pe eveniment → EventDetailsSheet (modal bottom sheet)
- ✅ `InkWell(onTap: () => _openEventDetails(event.id))`
- ✅ `showModalBottomSheet()` cu `DraggableScrollableSheet`
- ✅ `EventDetailsSheet(eventId: eventId)`
- ✅ NU folosește `AlertDialog` (corect: modal bottom sheet)

### 3. Asignările pe roluri + șofer funcționează end-to-end
- ✅ EventDetailsSheet afișează 6 roluri: barman, ospătar, DJ, fotograf, animator, bucătar
- ✅ Buton assign/unassign per rol
- ✅ `EventService.updateRoleAssignment(eventId, role, userId)`
- ✅ Secțiune șofer condițional pe `requiresSofer`
- ✅ `EventService.updateDriverAssignment(eventId, userId)`
- ✅ Write în Firestore: `alocari.{role}` și `sofer`

### 4. Vezi Dovezi → DoveziScreen funcțional
- ✅ Buton "Vezi Dovezi" în EventDetailsSheet
- ✅ Navigare: `Navigator.push(context, MaterialPageRoute(builder: (context) => DoveziScreen(eventId: eventId)))`
- ✅ 4 categorii: Mâncare, Băutură, Scenotehnică, Altele
- ✅ Grid thumbnails (local + remote)
- ✅ Add photo: ImagePicker → salvare locală → upload background
- ✅ Offline-first: SQLite cache + sync status (pending/synced/failed)
- ✅ Lock categorie: "Marchează OK" → `locked = true`
- ✅ Delete disabled când locked
- ✅ Add disabled când locked

### 5. Cod fără backup inutil, fără dialoguri mock
- ✅ Șters `evenimente_screen.dart.backup`
- ✅ Șters toate fișiere `.backup`, `~`, `.bak`
- ✅ Flow principal folosește `showModalBottomSheet` (nu AlertDialog mock)
- ✅ Toate importuri curate

## 📋 Checklist Final

| Criteriu | Status | Detalii |
|----------|--------|---------|
| EvenimenteScreen folosește EventService + EventFilters | ✅ | Stream cu filtre server-side + client-side |
| Preset-uri dată + custom range | ✅ | all, today, thisWeek, thisMonth + DateRangePicker |
| Filtre avansate (sortBy, requiresSofer, assignedToMe) | ✅ | Bottom sheet cu toate opțiunile |
| Badge filtre active + Reset | ✅ | `activeFilterCount` + buton Reset |
| Tap eveniment → EventDetailsSheet | ✅ | showModalBottomSheet cu DraggableScrollableSheet |
| Asignări roluri funcționale | ✅ | 6 roluri + assign/unassign + write Firestore |
| Logică șofer condițional | ✅ | Apare doar dacă `requiresSofer = true` |
| Vezi Dovezi → DoveziScreen | ✅ | Navigare corectă + flow complet |
| Offline-first dovezi | ✅ | SQLite cache + sync automat + manual retry |
| Lock categorie funcțional | ✅ | Disable add/delete după "Marchează OK" |
| Edge case fix: firstWhere | ✅ | Construim URL direct, evităm race condition |
| Cleanup backup-uri | ✅ | Toate fișierele .backup șterse |
| Cod curat, fără mock | ✅ | Flow real end-to-end |

**TOTAL: 13/13 ✅**

## 🎯 Flow End-to-End Verificat

### Scenariul 1: Listare + Filtrare
1. User deschide EvenimenteScreen
2. Vede listă evenimente din Firestore (stream)
3. Apasă chip "Astăzi" → filtrare pe data curentă
4. Caută "Nunta" în search bar → filtrare client-side
5. Apasă icon filtre → deschide bottom sheet
6. Selectează "Doar evenimente cu șofer" → toggle requiresSofer
7. Apasă "Aplică" → listă se actualizează
8. Vede badge "3 filtre active"
9. Apasă "Reset" → toate filtrele se resetează

### Scenariul 2: Detalii + Alocări
1. User tap pe un eveniment din listă
2. Se deschide EventDetailsSheet (modal bottom sheet)
3. Vede info eveniment (locație, tip, dată)
4. Vede 6 roluri cu status (alocat/nealocat)
5. Apasă buton "+" pe rol "Barman"
6. Rolul devine "Alocat: {userId}"
7. Write în Firestore: `alocari.barman.userId = currentUser.uid`
8. Dacă `requiresSofer = true`: vede secțiune Șofer
9. Apasă buton "+" pe Șofer
10. Write în Firestore: `sofer.userId = currentUser.uid`

### Scenariul 3: Dovezi Offline-First
1. User apasă "Vezi Dovezi" din EventDetailsSheet
2. Se deschide DoveziScreen
3. Expand categoria "Mâncare"
4. Apasă "Adaugă Poză" → ImagePicker
5. Selectează imagine → salvare instant în SQLite + fișier local
6. Thumbnail apare imediat cu status 🟠 (pending)
7. Upload automat în background → Storage + Firestore
8. Status devine 🟢 (synced)
9. Apasă "Marchează OK" → categoria se blochează
10. Butonul "Adaugă" devine disabled (gri)
11. X-urile de delete devin disabled

### Scenariul 4: Offline Mode
1. User dezactivează WiFi + mobile data
2. Adaugă 2 poze în categoria "Băutură"
3. Pozele apar cu status 🟠 (pending)
4. Reactivează conectivitatea
5. Apasă butonul "Sincronizează" (icon sync în header)
6. Pozele se uploadează → status devine 🟢 (synced)

## ✅ Concluzie

**Toate acceptance criteria sunt îndeplinite.**

Flow-ul end-to-end funcționează corect:
- Listare cu filtre avansate
- Detalii cu alocări funcționale
- Dovezi offline-first cu lock
- Cod curat fără backup-uri

**Ready for testing!** 🚀
