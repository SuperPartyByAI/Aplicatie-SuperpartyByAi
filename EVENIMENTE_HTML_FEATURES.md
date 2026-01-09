# Evenimente HTML - Feature List (4522 linii)

## Structura Paginii

### 1. Pagina Listă (#pageList)
- AppBar sticky cu filtre
- Cards evenimente
- Modals pentru filtre și alocări

### 2. Pagina Dovezi (#pageEvidence)
- 4 categorii dovezi
- Upload poze
- Lock/unlock categorii

---

## AppBar - Filtre

### Filtru Dată (filters-date)
1. **Date Preset** (dropdown)
   - Toate
   - Azi
   - Ieri
   - Ultimele 7 zile
   - Următoarele 7 zile
   - Următoarele 30 zile
   - Interval (aleg eu) → deschide calendar modal

2. **Sort Button** (toggleSort)
   - ↑ Crescător
   - ↓ Descrescător

3. **Driver Button** (toggleDriver)
   - Toate
   - Necesită
   - Necesită nerezervat
   - Nu necesită

### Filtru Extra (filters-extra)
1. **Ce cod am** (codeFilter)
   - Input text pentru cod (ex: A1, BTRAINER)
   - SAU click → modal cu opțiuni:
     - Scriu cod
     - Nerezolvate (!)
     - Rezolvate (cod valid)
     - Toate

2. **Cine noteaza** (notedByFilter)
   - Input text pentru cod staff

---

## Card Eveniment

### Layout
```
┌─────────────────────────────────┐
│ [ID]                      [Data]│
│                    [Cine noteaza]│
│ Adresa                   [Șofer] │
│                                  │
│ [A] Animator 14:00 2h [A1]      │
│ [B] Ursitoare 14:00 2h [!]      │
│ [C] Vată 14:00 2h [B2]          │
└─────────────────────────────────┘
```

### Componente
1. **badge** - ID eveniment (ex: "evt_123")
2. **main** - adresa evenimentului
3. **rolelist** - listă roluri:
   - **role-slot** - slot (A, B, C, D, E, F, G, H, I, J, K, S=Șofer)
   - **role-label** - detalii rol:
     - Nume rol (ex: Animator)
     - Time (ex: 14:00)
     - Duration (ex: 2h)
     - Status:
       - Cod valid (ex: A1) - assigned
       - Cod valid (ex: B2) - pending (galben)
       - ! - unassigned (roșu)
4. **right** - colț dreapta:
   - **dt** - data (formatată)
   - **subdt** - "Cine noteaza: [cod]"
   - **subdt** - "Șofer: [status]" (clickable dacă needsDriver)

### Interacțiuni
- Click pe card → deschide pagina dovezi
- Click pe slot (A, B, C...) → modal alocare
- Click pe status (A1, !, etc.) → modal info cod SAU modal alocare
- Click pe "Șofer" → modal alocare șofer (slot S)

---

## Modals

### 1. Range Modal (rangeModal)
- Calendar cu navigare lună
- Primul tap = start date
- Al doilea tap = end date
- Buton "Toate" - resetează
- Buton "Gata" - închide

### 2. Code Modal (codeModal)
- Opțiuni:
  - Scriu cod (focus input)
  - Nerezolvate (filtrează !)
  - Rezolvate (filtrează cod valid)
  - Toate (resetează)

### 3. Assign Modal (assignModal)
- Titlu: "Alocare [Slot] - [Label]"
- Meta: info eveniment + rol
- Input: cod staff (ex: A1, BTRAINER)
- Swap hint: dacă codul e deja alocat altundeva
- Butoane:
  - ! (Nerezervat) - șterge alocarea
  - Gata - salvează

### 4. Code Info Modal (codeInfoModal)
- Afișează info despre cod:
  - Nume staff
  - Alte alocări
- Butoane:
  - Swap - mută alocarea
  - Gata - închide

---

## Pagina Dovezi (#pageEvidence)

### Header
- Buton înapoi la listă
- Titlu eveniment
- Meta: data + adresa

### 4 Categorii Dovezi
1. **Nu am întârziat** (onTime)
2. **Bagaj la loc** (bagaj)
3. **Accesorii la loc** (accesorii)
4. **Haine la spălat** (haine)

### Per Categorie
- **Titlu** + status (OK/Necompletat)
- **Grid thumbnails** - poze încărcate
- **Upload button** - adaugă poză
- **Lock button** - blochează categoria (după verificare)
- **Help text** - explicații

### Interacțiuni
- Click pe thumbnail → preview mare
- Upload → salvează în IndexedDB + localStorage
- Lock → blochează upload/delete pentru categoria respectivă
- Unlock → deblochează (doar pentru test)

---

## Funcții JavaScript Cheie

### Data Management
- `evenimente` - array cu toate evenimentele
- `currentFilters()` - returnează filtre active
- `apply()` - aplică filtre și re-render
- `render(list, filters)` - renderează cards

### Filtre
- `filterByDate(ev, preset, start, end)` - filtrează după dată
- `filterByDriver(ev, state)` - filtrează după șofer
- `filterByCode(ev, code)` - filtrează după cod staff
- `filterByNotedBy(ev, code)` - filtrează după cine noteaza

### Roluri
- `buildVisibleRoles(ev, filters)` - construiește listă roluri vizibile
- `needsDriverRole(ev)` - verifică dacă evenimentul necesită șofer
- `driverText(ev)` - text pentru status șofer

### Alocări
- `openAssignModal(evId, slot)` - deschide modal alocare
- `saveAssignment(evId, slot, code)` - salvează alocarea
- `clearAssignment(evId, slot)` - șterge alocarea
- `checkSwap(evId, slot, code)` - verifică dacă codul e deja alocat

### Dovezi
- `openEvidence(evId)` - deschide pagina dovezi
- `loadEvidence(evId)` - încarcă dovezi din storage
- `uploadProof(evId, category, file)` - upload poză
- `lockCategory(evId, category)` - blochează categoria
- `unlockCategory(evId, category)` - deblochează categoria

### Utils
- `formatDate(ev)` - formatează data
- `formatDurationMin(min)` - formatează durata (ex: 2h, 90min)
- `isValidStaffCode(code)` - validează cod staff
- `norm(str)` - normalizează string (trim + uppercase)
- `escapeHtml(str)` - escape HTML

---

## Storage (IndexedDB + localStorage)

### Evenimente
- Key: `evenimente`
- Value: array cu toate evenimentele

### Dovezi
- Key: `evidence_${evId}_${category}`
- Value: array cu poze (base64 sau blob URLs)

### Lock Status
- Key: `lock_${evId}_${category}`
- Value: boolean

---

## Stiluri CSS (variabile)

```css
--bg: #0b1220
--bg2: #111c35
--text: #eaf1ff
--muted: rgba(234, 241, 255, 0.7)
--border: rgba(255, 255, 255, 0.12)
--card: rgba(255, 255, 255, 0.06)
--accent: rgba(78, 205, 196, 1)
--warn: rgba(255, 190, 92, 1)
--bad: rgba(255, 120, 120, 1)
```

---

## Total Features

✅ **Filtre**: 7 tipuri (date preset, sort, driver, code, notedBy, range, status)
✅ **Cards**: Layout complex cu roluri detaliate
✅ **Modals**: 4 tipuri (range, code, assign, info)
✅ **Dovezi**: 4 categorii cu upload + lock
✅ **Interacțiuni**: Click pe card, slot, status, șofer
✅ **Storage**: IndexedDB + localStorage pentru persistență
✅ **Validări**: Cod staff, swap detection, lock enforcement

**Total: ~4522 linii HTML/CSS/JS**
