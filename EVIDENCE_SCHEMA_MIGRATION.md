# Evidence Schema Migration Guide

## Overview

PR #20 standardizes the evidence schema from Romanian (`categorie`, `dovezi_meta`) to English (`category`, `evidenceState`). This migration ensures backward compatibility while transitioning to the new schema.

## Changes

### Field Names
- **Old:** `categorie` (Romanian)
- **New:** `category` (English)

### Collection Names
- **Old:** `dovezi_meta`
- **New:** `evidenceState`

## Migration Strategy: Dual-Write with Backward Compatibility

### Phase 1: Deploy Code with Dual Support (CURRENT)

**Code Changes:**
1. ✅ `EvidenceModel.fromFirestore()` reads from `category` OR `categorie` (fallback)
2. ✅ `EvidenceModel.toFirestore()` writes BOTH `category` AND `categorie`
3. ✅ All service methods use `category` parameter
4. ✅ All Firestore queries use `.where('category')`

**Infrastructure Changes:**
1. ✅ Firestore rules support BOTH `evidenceState` AND `dovezi_meta` collections
2. ✅ Firestore indexes created for BOTH `category` AND `categorie` fields

**Status:** ✅ READY TO DEPLOY

### Phase 2: Migrate Existing Data

Run migration script to add `category` field to existing documents:

```bash
# Dry run first (no changes)
node scripts/migrate-evidence-schema.js --dry-run

# Apply migration
node scripts/migrate-evidence-schema.js
```

**What it does:**
- Finds all documents with `categorie` but no `category`
- Copies value from `categorie` to `category`
- Keeps both fields for compatibility

**Status:** ⏳ PENDING (run after Phase 1 deployment)

### Phase 3: Deploy Rules and Indexes

Deploy updated Firestore configuration:

```bash
# Deploy rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

**Status:** ⏳ PENDING (run after Phase 2 migration)

### Phase 4: Verify and Monitor

Monitor for 1-2 weeks:
- Check logs for any `categorie` field access
- Verify all queries use `category` field
- Confirm no errors in production

**Status:** ⏳ PENDING

### Phase 5: Cleanup (Optional - Future)

After verification period, optionally remove backward compatibility:
1. Remove `categorie` write from `toFirestore()`
2. Remove `categorie` fallback from `fromFirestore()`
3. Remove `dovezi_meta` rules
4. Remove `categorie` indexes

**Status:** 🔮 FUTURE (not required immediately)

## Rollback Plan

If issues occur:

1. **Immediate:** Code already supports both schemas - no action needed
2. **If needed:** Revert to reading only `categorie` field
3. **Database:** No data loss - both fields exist

## Testing Checklist

Before deploying to production:

- [ ] Run migration script in dry-run mode
- [ ] Verify migration script output
- [ ] Test app with mixed data (some docs with only `categorie`, some with both)
- [ ] Verify queries work with both field names
- [ ] Test lock/unlock functionality
- [ ] Test upload/archive functionality

## Files Modified

### Code
- `superparty_flutter/lib/models/evidence_model.dart` - Dual read/write
- `superparty_flutter/lib/services/evidence_service.dart` - Standardized parameters

### Infrastructure
- `firestore.rules` - Support both collections
- `firestore.indexes.json` - Indexes for both fields
- `scripts/migrate-evidence-schema.js` - Migration script (NEW)

### CI/CD
- `.github/workflows/build-signed-apk.yml` - Added flutter analyze
- `.github/workflows/flutter-build.yml` - Added flutter analyze

## Current Status

✅ **Phase 1 Complete** - Code deployed with dual support
⏳ **Phase 2 Pending** - Run migration script
⏳ **Phase 3 Pending** - Deploy rules/indexes
⏳ **Phase 4 Pending** - Monitor
🔮 **Phase 5 Future** - Cleanup (optional)

## Support

For issues or questions:
1. Check logs for specific error messages
2. Verify Firestore rules are deployed
3. Confirm indexes are built (can take time)
4. Review migration script output
