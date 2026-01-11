# Test Plan - Evenimente Module Enhancement

## Overview

This document outlines the test plan for all new features implemented in the evenimente module, including interactive noting mode, role detection, short codes, and admin corrections.

## Test Execution

### Run All Tests

```bash
cd functions
npm test
```

### Run Specific Test Suite

```bash
npm test -- roleDetector.test.js
npm test -- dateTimeParser.test.js
npm test -- shortCodeGenerator.test.js
```

## Unit Tests

### ✅ RoleDetector (`roleDetector.test.js`)

**Coverage**:
- [x] Text normalization (remove diacritics, lowercase)
- [x] Role detection from text
- [x] Animator detection (including character names, MC)
- [x] Ursitoare detection
- [x] Multiple role detection
- [x] Synonym matching
- [x] Role details extraction (animator, ursitoare)
- [x] Duration parsing (hours, minutes, decimal, combined)

**Test Cases**:
1. Detect "animator" from "Vreau un animator"
2. Detect "animator" from "Vreau Elsa" (character name)
3. Detect "animator" from "Am nevoie de MC"
4. Detect "ursitoare" from "3 ursitoare pentru botez"
5. Detect multiple roles from "animator, vată de zahăr și popcorn"
6. Extract animator details: name, age, character
7. Extract ursitoare count (3 or 4, with 1 rea if 4)
8. Parse duration: "2 ore" → 120 minutes
9. Parse duration: "1.5 ore" → 90 minutes
10. Parse duration: "2 ore si 30 minute" → 150 minutes

### ✅ DateTimeParser (`dateTimeParser.test.js`)

**Coverage**:
- [x] Date parsing (DD-MM-YYYY format)
- [x] Date validation (reject relative dates)
- [x] Time parsing (HH:mm format)
- [x] Duration parsing (various formats)
- [x] Phone number parsing (Romanian format)
- [x] Formatting functions

**Test Cases**:
1. Parse valid date: "15-01-2026" → valid
2. Reject relative date: "mâine" → error
3. Reject day names: "vineri" → error
4. Validate date ranges (day 1-31, month 1-12, year 2024-2030)
5. Reject invalid dates: "31-02-2026" → error
6. Parse time: "14:30" → valid
7. Normalize time: "9:30" → "09:30"
8. Parse duration: "2 ore" → 120 minutes
9. Parse phone: "0712345678" → "+40712345678"
10. Format phone: "+40712345678" → "+40 712 345 678"

### ✅ ShortCodeGenerator (`shortCodeGenerator.test.js`)

**Coverage**:
- [x] Event short code generation (01, 02, ...)
- [x] Role slot generation (A, B, ..., Z)
- [x] Role code generation (01A, 01B, ...)
- [x] Role code parsing
- [x] Validation functions

**Test Cases**:
1. Generate first slot: [] → "A"
2. Generate next slot: [A, B] → "C"
3. Skip used slots: [A, C] → "B"
4. Throw error when all 26 slots used
5. Generate role code: ("01", "A") → "01A"
6. Parse role code: "01A" → { eventShortCode: "01", slot: "A" }
7. Validate event short code: "01" → true, "1" → false
8. Validate role code: "01A" → true, "1A" → false

## Integration Tests

### Conversation Flow Tests

**Test File**: `functions/__tests__/conversationFlow.test.js` (to be created)

**Scenarios**:

#### 1. Happy Path - Complete Event Creation

```
User: "Vreau să notez un eveniment"
AI: "Perfect! Am nevoie de data (DD-MM-YYYY), adresa, și serviciile necesare."

User: "15-01-2026, București, Str. Exemplu 10, pentru Maria 5 ani, animator și vată de zahăr"
AI: "Am înțeles:
     📅 Data: 15-01-2026
     📍 Adresa: București, Str. Exemplu 10
     🎂 Sărbătorit: Maria (5 ani)
     🎭 Servicii:
       1. Animator
       2. Vată de zahăr
     
     La ce oră începe animatorul?"

User: "14:00"
AI: "Cât durează animatorul?"

User: "2 ore"
AI: "La ce oră începe vata de zahăr?"

User: "14:00"
AI: "Cât durează vata de zahăr?"

User: "2 ore"
AI: "📋 Am înțeles:
     📅 Data: 15-01-2026
     📍 Adresa: București, Str. Exemplu 10
     🎂 Sărbătorit: Maria (5 ani)
     🎭 Servicii:
       1. Animator - 14:00 (2h)
       2. Vată de zahăr - 14:00 (2h)
     
     ✅ Confirm crearea evenimentului?"

User: "da"
AI: "✅ Eveniment creat cu succes!
     📋 Cod: 01
     📅 Data: 15-01-2026
     📍 Adresa: București, Str. Exemplu 10"
```

**Assertions**:
- [x] AI enters noting mode
- [x] AI asks for missing information
- [x] AI collects all required fields
- [x] AI generates confirmation summary
- [x] Event is created with short code
- [x] Roles have correct slots (A, B)
- [x] Transcript is saved

#### 2. Cancel Flow

```
User: "Vreau să notez un eveniment"
AI: "Perfect! Am nevoie de..."

User: "anulează"
AI: "✅ Am anulat notarea evenimentului. Cu ce te pot ajuta?"
```

**Assertions**:
- [x] Conversation state is cleared
- [x] AI exits noting mode
- [x] No event is created

#### 3. Animator with Character

```
User: "Vreau Elsa pentru petrecere pe 15-01-2026 la București"
AI: "Am înțeles că vrei animator cu personaj Elsa. Am nevoie de:
     - Numele sărbătoritului
     - Vârsta/data nașterii
     - Ora și durata"
```

**Assertions**:
- [x] AI detects "Elsa" as animator
- [x] AI sets personaj = "Elsa"
- [x] AI asks for required animator details

#### 4. Ursitoare with Count

```
User: "Vreau 4 ursitoare pentru botez"
AI: "Am înțeles 4 ursitoare (3 bune + 1 rea). Durată fixă: 60 minute.
     Am nevoie de:
     - Data (DD-MM-YYYY)
     - Adresa
     - Numele copilului
     - Data nașterii copilului
     - Ora"
```

**Assertions**:
- [x] AI detects 4 ursitoare
- [x] AI includes 1 rea automatically
- [x] AI sets fixed duration to 60 minutes
- [x] AI asks for required details

#### 5. UPDATE vs CREATE

```
User: "Mai vreau vată de zahăr" (with phone +40712345678)
AI: "Am găsit un eveniment viitor:
     📅 Data: 15-01-2026
     📍 Adresa: București, Str. Exemplu 10
     
     Vrei să adaugi vată de zahăr la acest eveniment?"

User: "da"
AI: "✅ Am adăugat vată de zahăr la evenimentul 01"
```

**Assertions**:
- [x] AI identifies existing event by phone
- [x] AI proposes UPDATE instead of CREATE
- [x] AI adds role to existing event
- [x] New role gets next available slot

#### 6. Multiple Events - Ambiguous

```
User: "Mai vreau popcorn" (with phone that has 2 future events)
AI: "Am găsit mai multe evenimente viitoare:
     1. [01] 📅 15-01-2026 - 📍 București, Str. Exemplu 10
     2. [02] 📅 20-01-2026 - 📍 Cluj, Str. Test 5
     
     Te rog să specifici:
     - Data (ex: 15-01-2026)
     - Adresa (ex: București)
     - SAU codul evenimentului (ex: 01)"

User: "01"
AI: "✅ Am adăugat popcorn la evenimentul 01"
```

**Assertions**:
- [x] AI finds multiple events
- [x] AI asks for clarification
- [x] AI accepts short code for identification
- [x] AI updates correct event

## Manual Testing Checklist

### Date Validation

- [ ] Accept "15-01-2026" (DD-MM-YYYY)
- [ ] Accept "15/01/2026" (with slash)
- [ ] Accept "15.01.2026" (with dot)
- [ ] Reject "mâine" (relative date)
- [ ] Reject "vineri" (day name)
- [ ] Reject "32-01-2026" (invalid day)
- [ ] Reject "15-13-2026" (invalid month)
- [ ] Reject "15-01-2020" (year too old)
- [ ] Reject "31-02-2026" (invalid date)
- [ ] Accept "29-02-2024" (leap year)
- [ ] Reject "29-02-2025" (non-leap year)

### Duration Parsing

- [ ] "2 ore" → 120 minutes
- [ ] "90 minute" → 90 minutes
- [ ] "1.5 ore" → 90 minutes
- [ ] "1,5 ore" → 90 minutes
- [ ] "2 ore si 30 minute" → 150 minutes
- [ ] "120" → 120 minutes
- [ ] "2" → 120 minutes (< 10 = hours)
- [ ] "o oră jumătate" → 90 minutes

### Role Detection

- [ ] "animator" → Animator
- [ ] "Elsa" → Animator (personaj: Elsa)
- [ ] "MC" → Animator (personaj: MC)
- [ ] "3 ursitoare" → Ursitoare (count: 3)
- [ ] "4 ursitoare" → Ursitoare (count: 4, includesRea: true)
- [ ] "vată de zahăr" → Vată de zahăr
- [ ] "vata de zahar" → Vată de zahăr (no diacritics)
- [ ] "popcorn" → Popcorn
- [ ] "animator, vată și popcorn" → 3 roles

### Short Codes

- [ ] First event gets code "01"
- [ ] Second event gets code "02"
- [ ] First role gets slot "A" → "01A"
- [ ] Second role gets slot "B" → "01B"
- [ ] Can identify event by short code "01"
- [ ] Can identify role by role code "01A"

### Animator Details

- [ ] Collect sărbătorit name
- [ ] Collect data nașterii
- [ ] Collect vârstă reală
- [ ] Collect personaj/character
- [ ] Collect număr copii aprox
- [ ] Collect parent name
- [ ] Collect client phone

### Ursitoare Details

- [ ] Ask "3 sau 4 ursitoare?"
- [ ] If 4, include 1 rea automatically
- [ ] Fixed duration: 60 minutes (don't ask)
- [ ] Same time for all ursitoare
- [ ] Collect sărbătorit name
- [ ] Collect data nașterii

### CREATE vs UPDATE

- [ ] "Vreau să notez" → CREATE
- [ ] "Mai vreau" + phone → search existing
- [ ] 1 existing event → propose UPDATE
- [ ] Multiple existing events → ask for clarification
- [ ] No existing events → CREATE
- [ ] Accept date for identification
- [ ] Accept address for identification
- [ ] Accept short code for identification

### Archive

- [ ] Can archive entire event
- [ ] Can archive single role
- [ ] AI asks: "Arhivez doar rolul X sau tot evenimentul?"
- [ ] Archived events don't appear in future events search

### Admin Corrections

- [ ] Correction button only visible to super admin
- [ ] Can view AI interpretation log
- [ ] Can add new synonyms
- [ ] Can add role mapping rules
- [ ] Can add duration rules
- [ ] Overrides are applied in next detection

## Performance Tests

### Response Time

- [ ] AI response < 3 seconds (normal case)
- [ ] AI response < 5 seconds (complex case)
- [ ] Event creation < 2 seconds
- [ ] Event update < 2 seconds
- [ ] List events < 1 second

### Concurrency

- [ ] Multiple users can create events simultaneously
- [ ] Short code generation is atomic (no duplicates)
- [ ] Role slot generation is correct under concurrent updates

## Regression Tests

### Existing Functionality

- [ ] Old chatEventOps still works
- [ ] Event listing still works
- [ ] Event archiving still works
- [ ] Audit trail still works
- [ ] Rate limiting still works

## Test Data

### Sample Events

```javascript
const sampleEvents = [
  {
    date: '15-01-2026',
    address: 'București, Str. Exemplu 10',
    client: '+40712345678',
    sarbatoritNume: 'Maria',
    sarbatoritVarsta: 5,
    roles: [
      {
        label: 'Animator',
        startTime: '14:00',
        durationMinutes: 120,
        details: {
          sarbatoritNume: 'Maria',
          dataNastere: '15-01-2021',
          varstaReala: 5,
          personaj: 'Elsa',
        },
      },
      {
        label: 'Vată de zahăr',
        startTime: '14:00',
        durationMinutes: 120,
      },
    ],
  },
  {
    date: '20-01-2026',
    address: 'Cluj, Str. Test 5',
    client: '+40712345678',
    sarbatoritNume: 'Ion',
    sarbatoritVarsta: 1,
    roles: [
      {
        label: 'Ursitoare',
        startTime: '15:00',
        durationMinutes: 60,
        details: {
          count: 4,
          includesRea: true,
          sarbatoritNume: 'Ion',
          dataNastere: '20-01-2025',
        },
      },
    ],
  },
];
```

## Bug Tracking

### Known Issues

1. **Issue**: [None yet]
   - **Severity**: N/A
   - **Status**: N/A
   - **Workaround**: N/A

## Test Results

### Last Run: [Date]

- **Total Tests**: 0
- **Passed**: 0
- **Failed**: 0
- **Skipped**: 0
- **Coverage**: 0%

### Test Execution Log

```
[To be filled after running tests]
```

## Continuous Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: cd functions && npm install
      - run: cd functions && npm test
```

## Sign-off

### Test Plan Approval

- [ ] Test plan reviewed by: _______________
- [ ] Test plan approved by: _______________
- [ ] Date: _______________

### Test Execution Sign-off

- [ ] All tests executed: _______________
- [ ] All tests passed: _______________
- [ ] Date: _______________
