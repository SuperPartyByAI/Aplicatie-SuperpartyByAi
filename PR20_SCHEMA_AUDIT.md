# PR #20 Schema Consistency Audit

## B4: Global Grep Results

### 1. "categorie" occurrences in Dart code

**lib/services/evidence_service.dart:**
- Line 299: Exception message "Eroare la blocarea categoriei"
- Line 337: Exception message "Eroare la deblocarea categoriei"
- Line 445: `categorie: category,` (parameter mapping in uploadEvidenceFromPath)

**lib/services/local_evidence_cache_service.dart:**
- Line 27: SQL column `categorie TEXT NOT NULL`
- Line 39: SQL index `idx_event_category ON event_evidence_cache(eventId, categorie)`
- Line 61: Parameter `required EvidenceCategory categorie`
- Line 66-67: WHERE clause `where: 'eventId = ? AND categorie = ?'`

**Status:** ⚠️ local_evidence_cache_service.dart uses old schema (SQL database)

### 2. "dovezi_meta" occurrences

**Result:** ✅ NONE - All migrated to `evidenceState`

### 3. "evidenceState" occurrences

**lib/services/evidence_service.dart:**
- Line 295: `.collection('evidenceState')` (lockCategory)
- Line 333: `.collection('evidenceState')` (unlockCategory)
- Line 350: `.collection('evidenceState')` (getCategoryMeta)
- Line 376: `.collection('evidenceState')` (getCategoryMetaStream)
- Line 392: `.collection('evidenceState')` (_updateCategoryPhotoCount)
- Line 455: `.collection('evidenceState')` (getCategoryStatesStream)
- Line 480: `.collection('evidenceState')` (updateCategoryStatus)

**Status:** ✅ Consistent use of `evidenceState` collection

### 4. Firestore WHERE clauses

**`.where('category')`:**
- lib/services/evidence_service.dart:118 (getEvidenceStream)
- lib/services/evidence_service.dart:143 (getArchivedEvidenceStream)
- lib/services/evidence_service.dart:170 (getEvidenceList)

**`.where('categorie')`:**
- ✅ NONE

**Status:** ✅ All queries use `category` field

### 5. Firestore Rules (firestore.rules)

**Lines 57-58:**
```
!exists(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(resource.data.categorie)) ||
!get(/databases/$(database)/documents/evenimente/$(eventId)/dovezi_meta/$(resource.data.categorie)).data.locked
```

**Line 63:**
```
match /dovezi_meta/{categorie} {
```

**Status:** ❌ CRITICAL - Rules still reference old schema (`dovezi_meta` + `categorie` field)

### 6. Firestore Indexes (firestore.indexes.json)

**Indexes on `categorie` field:**
- Index 1: `isArchived` + `categorie` + `uploadedAt DESC`
- Index 2: `isArchived` + `categorie` + `archivedAt DESC`

**Status:** ❌ CRITICAL - Indexes reference old field name `categorie` instead of `category`

## Summary

### ✅ Migrated Successfully
- All Dart service code uses `category` parameter
- All Firestore queries use `.where('category')`
- All collection references use `evidenceState`

### ❌ Needs Migration
1. **firestore.rules** - References `dovezi_meta` collection and `categorie` field
2. **firestore.indexes.json** - Indexes on `categorie` field instead of `category`
3. **local_evidence_cache_service.dart** - SQL schema uses `categorie` (but service is unused)

### ⚠️ Backward Compatibility Risk
Current code writes `category` field but:
- Firestore rules check `categorie` field
- Firestore indexes are on `categorie` field
- This will cause:
  - Lock checks to fail (rules can't find field)
  - Queries to be slow/fail (no matching index)

## Recommended Strategy

**Option 1: Dual-write with migration (RECOMMENDED)**
1. Update code to write BOTH `category` AND `categorie` fields temporarily
2. Deploy code changes
3. Run migration script to add `category` field to existing documents
4. Update rules and indexes to use `category`
5. Deploy rules/indexes
6. Remove `categorie` writes from code after verification

**Option 2: Breaking change with downtime**
1. Update rules and indexes to use `category`
2. Deploy rules/indexes
3. Run migration script
4. Code already uses `category` (done)

**Option 3: Keep backward compatibility forever**
1. Update code to read from `category` OR `categorie` (fallback)
2. Update code to write BOTH fields
3. Update rules to check BOTH fields
4. Create indexes for BOTH fields
