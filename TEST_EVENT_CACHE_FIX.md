# Test: Event Cache Bypass Fix

## Obiectiv
Verifică că comenzile de event nu sunt "furate" de cache și că `/event` este case-insensitive.

## Modificări Aplicate

### 1. Detectare Event Înainte de Cache
```dart
// Detect event intent early (before cache) to avoid cache hijacking event commands
final lowerText = text.toLowerCase();
final isExplicitCommand =
    lowerText.startsWith('/event ') || lowerText.startsWith('/eveniment ');
final hasNaturalEventIntent = _detectEventIntent(text);
final isEventCommand = isExplicitCommand || hasNaturalEventIntent;
```

### 2. Cache Bypass pentru Events
```dart
// Check cache first (only for non-event text without image)
final cachedResponse = (!hasImage && !isEventCommand)
    ? await AICacheService.getCachedResponse(text)
    : null;
```

### 3. Case-Insensitive Prefix Detection
```dart
final prefixLength = lowerText.startsWith('/event ') ? 7 : 11;
```

## Scenarii de Test

### Test 1: Case-Insensitive Command
**Input:** `/Event Test pe 15-02-2026 la Str. Florilor 10`
**Expected:** 
- ✅ Detectează ca event command (cu E mare)
- ✅ Bypass cache
- ✅ Apelează chatEventOps
- ✅ Afișează preview + confirm

### Test 2: Lowercase Command
**Input:** `/event Test pe 15-02-2026 la Str. Florilor 10`
**Expected:**
- ✅ Detectează ca event command
- ✅ Bypass cache
- ✅ Apelează chatEventOps
- ✅ Afișează preview + confirm

### Test 3: Uppercase Command
**Input:** `/EVENT Test pe 15-02-2026 la Str. Florilor 10`
**Expected:**
- ✅ Detectează ca event command
- ✅ Bypass cache
- ✅ Apelează chatEventOps
- ✅ Afișează preview + confirm

### Test 4: Mixed Case Command
**Input:** `/EvEnT Test pe 15-02-2026 la Str. Florilor 10`
**Expected:**
- ✅ Detectează ca event command
- ✅ Bypass cache
- ✅ Apelează chatEventOps
- ✅ Afișează preview + confirm

### Test 5: Duplicate Event Command (Idempotency)
**Input:** `/event Test pe 15-02-2026 la Str. Florilor 10` (trimis de 2 ori)
**Expected:**
- ✅ Prima dată: creează preview
- ✅ A doua oară: NU folosește cache, creează preview din nou
- ✅ După confirm: idempotency previne duplicat

### Test 6: Natural Language Event
**Input:** `Vreau să notez o petrecere pentru Maria pe 15-02-2026`
**Expected:**
- ✅ Detectează ca natural event intent
- ✅ Bypass cache
- ✅ Intră în flow interactiv

### Test 7: Normal Chat (Non-Event)
**Input:** `Salut, cum merge?`
**Expected:**
- ✅ NU detectează ca event
- ✅ Folosește cache dacă există
- ✅ Răspunde normal prin chatWithAI

### Test 8: Cached Non-Event Message
**Input:** `Ce servicii oferiți?` (trimis de 2 ori)
**Expected:**
- ✅ Prima dată: apelează chatWithAI, salvează în cache
- ✅ A doua oară: servește din cache (rapid)

## Verificare Cod

### Înainte (Problematic)
```dart
// Cache era verificat ÎNAINTE de detectarea event
final cachedResponse = (!hasImage) ? await AICacheService.getCachedResponse(text) : null;
if (cachedResponse != null) {
  return; // Event commands erau blocate aici!
}

// Detectare event venea DUPĂ cache
final isExplicitCommand = text.startsWith('/event '); // Case-sensitive!
```

### După (Fixed)
```dart
// Detectare event ÎNAINTE de cache
final lowerText = text.toLowerCase();
final isExplicitCommand = lowerText.startsWith('/event '); // Case-insensitive!
final isEventCommand = isExplicitCommand || hasNaturalEventIntent;

// Cache bypass pentru events
final cachedResponse = (!hasImage && !isEventCommand) ? ... : null;
```

## Rezultate Așteptate

| Test | Status | Note |
|------|--------|------|
| Case-insensitive `/Event` | ✅ | Detectează corect |
| Cache bypass pentru events | ✅ | Nu mai "fură" comenzile |
| Idempotency funcționează | ✅ | Previne duplicate |
| Natural language events | ✅ | Flow interactiv funcționează |
| Normal chat folosește cache | ✅ | Performance OK |

## Debugging

Dacă events nu funcționează:

1. **Verifică logs:**
   ```dart
   print('lowerText: $lowerText');
   print('isExplicitCommand: $isExplicitCommand');
   print('isEventCommand: $isEventCommand');
   print('cachedResponse: ${cachedResponse != null}');
   ```

2. **Verifică că `_detectEventIntent` funcționează:**
   ```dart
   final hasNaturalEventIntent = _detectEventIntent(text);
   print('hasNaturalEventIntent: $hasNaturalEventIntent');
   ```

3. **Verifică că cache-ul nu interferează:**
   ```dart
   if (cachedResponse != null && isEventCommand) {
     print('ERROR: Cache hit for event command!');
   }
   ```

## Concluzie

Fix-ul rezolvă problema prin:
1. ✅ Mutarea detectării event ÎNAINTE de cache
2. ✅ Făcând `/event` case-insensitive
3. ✅ Bypass cache pentru toate comenzile de event
4. ✅ Păstrând cache-ul pentru chat normal (performance)

---

**Status:** ✅ Implementat și gata de testare
**Branch:** fix/event-cache-bypass
**Data:** 2026-01-09
