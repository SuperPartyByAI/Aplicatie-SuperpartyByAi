# Plan Implementare Evenimente - 100% Fidel HTML

## Status: 🚧 IN PROGRESS

## Faze Implementare

### ✅ Faza 1: Analiză & Extragere (DONE)

- [x] Extras toate feature-urile din HTML (4522 linii)
- [x] Documentat în EVENIMENTE_HTML_FEATURES.md
- [x] Identificat structura de date

### 🔄 Faza 2: Modele de Date (IN PROGRESS)

- [ ] Verificat EventModel actual vs HTML
- [ ] Adaptat EventModel pentru compatibilitate 100%
- [ ] Creat RoleModel identic cu HTML
- [ ] Creat IncasareModel identic cu HTML

### ⏳ Faza 3: AppBar & Filtre

- [ ] AppBar sticky cu gradient
- [ ] Filtru Date Preset (dropdown: Toate, Azi, Ieri, etc.)
- [ ] Sort Button (↑↓)
- [ ] Driver Button (4 states: Toate, Necesită, Necesită nerezervat, Nu necesită)
- [ ] Input "Ce cod am" + modal opțiuni
- [ ] Input "Cine noteaza"
- [ ] Hint text sub filtre

### ⏳ Faza 4: Card Eveniment

- [ ] Layout exact ca HTML:

  ```
  [ID]                      [Data]
                     [Cine noteaza]
  Adresa                   [Șofer]

  [A] Animator 14:00 2h [A1]
  [B] Ursitoare 14:00 2h [!]
  ```

- [ ] Badge ID (stânga sus)
- [ ] Right column (data, cine noteaza, șofer)
- [ ] Rolelist cu slot + label + time + duration + status
- [ ] Color coding: assigned (normal), pending (galben), unassigned (roșu)
- [ ] Click handlers: card, slot, status, șofer

### ⏳ Faza 5: Modals

- [ ] Range Modal (calendar cu 2 taps)
- [ ] Code Modal (4 opțiuni)
- [ ] Assign Modal (input + swap hint + butoane)
- [ ] Code Info Modal (info + swap button)

### ⏳ Faza 6: Pagina Dovezi

- [ ] Header cu back button
- [ ] 4 categorii dovezi
- [ ] Grid thumbnails
- [ ] Upload button per categorie
- [ ] Lock/unlock functionality
- [ ] Storage în IndexedDB/SharedPreferences

### ⏳ Faza 7: Funcții & Logică

- [ ] filterByDate
- [ ] filterByDriver
- [ ] filterByCode
- [ ] filterByNotedBy
- [ ] buildVisibleRoles
- [ ] needsDriverRole
- [ ] driverText
- [ ] saveAssignment
- [ ] checkSwap
- [ ] formatDate
- [ ] formatDurationMin
- [ ] isValidStaffCode

### ⏳ Faza 8: Stiluri & Culori

- [ ] Variabile CSS → Flutter Theme
- [ ] Gradient background
- [ ] Backdrop blur pe AppBar
- [ ] Border radius & shadows
- [ ] Color states (hover, active, pressed)

### ⏳ Faza 9: Testare

- [ ] Test filtre (toate combinațiile)
- [ ] Test alocări (assign, pending, clear, swap)
- [ ] Test dovezi (upload, lock, unlock)
- [ ] Test interacțiuni (click card, slot, status)
- [ ] Test persistență (reload page)

### ⏳ Faza 10: Finalizare

- [ ] Code review complet
- [ ] Verificare 100% identic cu HTML
- [ ] Documentație
- [ ] Commit & push

---

## Fișiere de Creat/Modificat

### Modele

- `lib/models/event_model_html.dart` - model identic cu HTML
- `lib/models/role_model_html.dart` - model rol HTML
- `lib/models/incasare_model_html.dart` - model incasare HTML

### Screens

- `lib/screens/evenimente/evenimente_screen_html.dart` - pagina listă
- `lib/screens/evenimente/event_card_html.dart` - card eveniment
- `lib/screens/evenimente/dovezi_screen_html.dart` - pagina dovezi

### Widgets

- `lib/widgets/date_preset_dropdown.dart` - dropdown date
- `lib/widgets/sort_button.dart` - buton sort
- `lib/widgets/driver_button.dart` - buton driver
- `lib/widgets/code_filter_input.dart` - input cod
- `lib/widgets/role_list_item.dart` - item rol în card

### Modals

- `lib/widgets/modals/range_modal.dart` - calendar interval
- `lib/widgets/modals/code_modal.dart` - opțiuni cod
- `lib/widgets/modals/assign_modal.dart` - alocare rol
- `lib/widgets/modals/code_info_modal.dart` - info cod

### Services

- `lib/services/event_filter_service.dart` - logică filtre
- `lib/services/assignment_service.dart` - logică alocări
- `lib/services/evidence_storage_service.dart` - storage dovezi

### Utils

- `lib/utils/date_formatter.dart` - formatare date
- `lib/utils/duration_formatter.dart` - formatare durate
- `lib/utils/code_validator.dart` - validare coduri

---

## Estimare Timp

- Faza 2: 1h
- Faza 3: 3h
- Faza 4: 4h
- Faza 5: 4h
- Faza 6: 3h
- Faza 7: 3h
- Faza 8: 2h
- Faza 9: 2h
- Faza 10: 1h

**Total: ~23 ore**

---

## Reguli Stricte

1. ✅ **0% invenții** - doar ce e în HTML
2. ✅ **0% omisiuni** - tot ce e în HTML trebuie implementat
3. ✅ **100% identic** - layout, culori, interacțiuni, logică
4. ✅ **Verificare continuă** - compar cu HTML la fiecare pas

---

- **Audio vs Video**: Deoarece URL-ul deschide doar chat-ul, ambele butoane WhatsApp (Audio/Video) vor face în esență același lucru (deschid chat-ul), dar oferă context vizual și instrucțiuni diferite utilizatorului.
- **Dacă WhatsApp lipsește**:
  - Aplicația are un fallback automat: dacă nu poate deschide link-ul nativ (`whatsapp://`), va încerca să deschidă browser-ul cu `https://wa.me/`.
  - De asemenea, am prevăzut un buton separat de **Apel Normal** (pictograma albastră de telefon) care folosește rețeaua mobilă clasică - acesta este cel mai sigur "colac de salvare" dacă utilizatorul nu are internet sau WhatsApp instalat.
- **Identitatea Apelantului (IMPORTANT)**:
  > [!IMPORTANT]
  > Apelul se va face mereu folosind **numărul de telefon activ în aplicația WhatsApp de pe dispozitivul fizic**.
  > De exemplu, dacă angajatul are propriul WhatsApp pe telefon, clientul va vedea numărul personal al angajatului, nu numărul business din aplicație. Aceasta este o limitare tehnică a WhatsApp (nu permit "impersonarea" numărului prin deep-link).
- **Problemă identificată**: Caracterul `+` în parametrul `phone` poate cauza eșecul deschiderii link-ului pe anumite dispozitive.

---

## Progress Tracking

- **Faze complete**: 1/10 (10%)
- **Fișiere create**: 0/20
- **Linii cod estimate**: ~3000-4000 (Flutter echivalent pentru 4522 HTML/CSS/JS)

---

**Ultima actualizare**: 2026-01-09 16:58 UTC
