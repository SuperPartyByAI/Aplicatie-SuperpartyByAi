# Force Update Schema Migration Guide

## Overview

The Force Update system now supports **multiple schema variations** and includes **fail-safe mechanisms** to prevent app crashes when Firestore config is missing or malformed.

## Supported Schema Variations

### Recommended Schema (Current)
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",           // String: minimum version required
  "min_build_number": 22,           // Int: minimum build number required
  "force_update": true,             // Bool: whether to enforce update
  "update_message": "...",          // String: message shown to user
  "release_notes": "...",           // String: what's new
  "android_download_url": "...",    // String: APK download URL
  "ios_download_url": "...",        // String: App Store URL
  "updated_at": "2026-01-09T12:00:00Z"
}
```

### Legacy Schema (Supported)
```javascript
// Firestore: app_config/version
{
  "latest_version": "1.2.2",        // ✅ Mapped to min_version
  "latest_build_number": 22,        // ✅ Mapped to min_build_number
  "force_update": true,
  "update_message": "...",
  "release_notes": "...",
  "android_download_url": "...",
  "ios_download_url": "..."
}
```

### CamelCase Schema (Supported)
```javascript
// Firestore: app_config/version
{
  "minVersion": "1.2.2",            // ✅ Mapped to min_version
  "minBuildNumber": 22,             // ✅ Mapped to min_build_number
  "latestVersion": "1.2.2",         // ✅ Fallback for min_version
  "latestBuildNumber": 22,          // ✅ Fallback for min_build_number
  "forceUpdate": true,              // ⚠️ Use force_update (snake_case)
  "updateMessage": "...",           // ⚠️ Use update_message (snake_case)
  "releaseNotes": "...",            // ⚠️ Use release_notes (snake_case)
  "androidDownloadUrl": "...",      // ⚠️ Use android_download_url (snake_case)
  "iosDownloadUrl": "..."           // ⚠️ Use ios_download_url (snake_case)
}
```

## Field Name Priority

The parser tries field names in this order:

### Version Field
1. `min_version` (recommended)
2. `latest_version` (legacy)
3. `minVersion` (camelCase)
4. `latestVersion` (camelCase legacy)

### Build Number Field
1. `min_build_number` (recommended)
2. `latest_build_number` (legacy)
3. `minBuildNumber` (camelCase)
4. `latestBuildNumber` (camelCase legacy)

## Type Normalization

The parser handles multiple data types:

### Build Number
- **Int**: Used directly ✅
- **Double**: Converted to int (e.g., 22.0 → 22) ✅
- **String**: Parsed to int (e.g., "22" → 22) ✅

### Version
- **String**: Used directly ✅
- **Other types**: Converted to string ✅

## Fail-Safe Behavior

### Missing Document
If `app_config/version` doesn't exist:
```
[ForceUpdateChecker] ⚠️ No version config in Firestore
[ForceUpdateChecker] ℹ️ Using safe default (force_update=false)
```
**Result**: App continues without blocking ✅

### Missing Required Fields
If both version and build number are missing:
```
[AppVersionConfig] ⚠️ Missing required fields in Firestore config
[AppVersionConfig] ⚠️ Using safe default: force_update=false, min_build_number=0
[AppVersionConfig] 💡 Recommendation: Update Firestore app_config/version
```
**Result**: App continues without blocking ✅

### Firestore Unavailable
If Firestore read fails (offline, timeout, permissions):
```
[ForceUpdateChecker] ⚠️ Firebase error: permission-denied
[ForceUpdateChecker] ℹ️ Common causes:
[ForceUpdateChecker]    - Firestore not initialized
[ForceUpdateChecker]    - No internet connection
[ForceUpdateChecker]    - Firestore rules blocking read
[ForceUpdateChecker] ℹ️ App will continue without force update check
```
**Result**: App continues without blocking ✅

### Firebase Not Initialized
If Firebase initialization failed:
```
[ForceUpdateChecker] ⚠️ Firebase not initialized
[ForceUpdateChecker] ℹ️ Skipping force update check
```
**Result**: App continues without blocking ✅

## Migration Steps

### Option 1: Keep Legacy Schema (No Action Required)
Your existing schema will continue to work:
```javascript
{
  "latest_version": "1.2.2",
  "latest_build_number": 22,
  "force_update": true,
  // ... other fields
}
```
The app will automatically map `latest_*` to `min_*`.

### Option 2: Migrate to New Schema (Recommended)
Update your Firestore document to use the new field names:

**Before:**
```javascript
{
  "latest_version": "1.2.2",
  "latest_build_number": 22,
  "force_update": true
}
```

**After:**
```javascript
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "force_update": true
}
```

**Benefits:**
- Clearer semantics (min = minimum required, not latest available)
- Consistent with industry standards
- Better documentation

### Option 3: Hybrid Approach (Safest During Transition)
Include both old and new field names:
```javascript
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "latest_version": "1.2.2",        // Fallback for old app versions
  "latest_build_number": 22,        // Fallback for old app versions
  "force_update": true
}
```

This ensures compatibility with both old and new app versions during rollout.

## Testing Scenarios

### Test 1: Legacy Schema
**Setup:**
```javascript
// Firestore: app_config/version
{
  "latest_version": "1.2.2",
  "latest_build_number": 22,
  "force_update": true,
  "android_download_url": "https://..."
}
```

**Expected:**
- ✅ App parses config successfully
- ✅ Log shows: "Legacy schema detected: using latest_* fields"
- ✅ Force update works correctly

### Test 2: Missing Document
**Setup:**
- Delete `app_config/version` document

**Expected:**
- ✅ App starts without crashing
- ✅ Log shows: "No version config in Firestore"
- ✅ Log shows: "Using safe default (force_update=false)"
- ✅ No force update dialog shown

### Test 3: Empty Document
**Setup:**
```javascript
// Firestore: app_config/version
{}
```

**Expected:**
- ✅ App starts without crashing
- ✅ Log shows: "Missing required fields in Firestore config"
- ✅ Log shows: "Using safe default"
- ✅ No force update dialog shown

### Test 4: Partial Document
**Setup:**
```javascript
// Firestore: app_config/version
{
  "force_update": true,
  "update_message": "Please update"
  // Missing version and build number
}
```

**Expected:**
- ✅ App starts without crashing
- ✅ Log shows: "Missing required fields"
- ✅ Safe default used (force_update=false overrides true in document)
- ✅ No force update dialog shown

### Test 5: Offline Mode
**Setup:**
- Enable airplane mode
- Start app

**Expected:**
- ✅ App starts without crashing
- ✅ Log shows: "Firestore timeout" or "Firebase error"
- ✅ Log shows: "App will continue without force update check"
- ✅ No force update dialog shown

### Test 6: Type Mismatch
**Setup:**
```javascript
// Firestore: app_config/version
{
  "min_version": "1.2.2",
  "min_build_number": "22",        // String instead of int
  "force_update": true
}
```

**Expected:**
- ✅ App parses config successfully
- ✅ Build number converted from string to int
- ✅ Force update works correctly

## Firestore Rules

Ensure your Firestore rules allow public read for version config:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /app_config/{document} {
      allow read: if true;  // Public read for version check
      allow write: if false; // Only admin via console
    }
  }
}
```

## Troubleshooting

### App Crashes on Startup
**Symptom:** App crashes immediately after splash screen

**Possible Causes:**
1. Old app version without fail-safe code
2. Critical Firebase initialization error

**Solution:**
1. Update to latest app version with fail-safe code
2. Check Firebase configuration in `google-services.json` / `GoogleService-Info.plist`

### Force Update Not Working
**Symptom:** Force update dialog doesn't appear even when it should

**Check:**
1. Firestore document exists: `app_config/version`
2. `force_update` field is `true` (boolean, not string)
3. `min_build_number` is greater than current build
4. Firestore rules allow read access
5. Device has internet connection

**Debug:**
```bash
flutter logs | grep ForceUpdateChecker
```

Look for:
- "Force update disabled in config" → `force_update` is false
- "App is up to date" → Current build >= min_build_number
- "No version config in Firestore" → Document missing
- "Firebase error" → Connection or permission issue

### Legacy Schema Warning
**Symptom:** Log shows "Legacy schema detected"

**Impact:** None - app works correctly

**Action:** Optional migration to new schema for clarity

**To Migrate:**
1. Open Firebase Console → Firestore
2. Navigate to `app_config/version`
3. Rename fields:
   - `latest_version` → `min_version`
   - `latest_build_number` → `min_build_number`
4. Save changes

## Best Practices

### 1. Always Include Both Fields
```javascript
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  // Don't rely on just one field
}
```

### 2. Use Consistent Types
```javascript
{
  "min_version": "1.2.2",           // String ✅
  "min_build_number": 22,           // Int ✅
  "force_update": true              // Boolean ✅
}
```

### 3. Test Before Enabling Force Update
```javascript
// Step 1: Deploy new version
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "force_update": false             // Test first
}

// Step 2: After verifying, enable force update
{
  "min_version": "1.2.2",
  "min_build_number": 22,
  "force_update": true              // Enable after testing
}
```

### 4. Provide Clear Messages
```javascript
{
  "update_message": "Versiune nouă disponibilă cu funcții îmbunătățite!",
  "release_notes": "• Pagină Evenimente nouă\n• Sistem Dovezi\n• Bug fixes"
}
```

### 5. Monitor Logs
```bash
# Watch for issues
flutter logs | grep -E "(ForceUpdateChecker|AppVersionConfig)"

# Look for warnings
flutter logs | grep "⚠️"
```

## Safe Default Values

When config is unavailable, these defaults are used:

```dart
AppVersionConfig.safeDefault() {
  minVersion: '0.0.0',              // Never blocks (all versions >= 0.0.0)
  minBuildNumber: 0,                // Never blocks (all builds >= 0)
  forceUpdate: false,               // CRITICAL: don't block app
  updateMessage: 'O versiune nouă este disponibilă...',
  releaseNotes: '',
  androidDownloadUrl: null,
  iosDownloadUrl: null,
  updatedAt: null,
}
```

## Summary

✅ **Backward Compatible**: Supports legacy schemas  
✅ **Fail-Safe**: Never crashes on missing/invalid config  
✅ **Type Flexible**: Handles string/int/double build numbers  
✅ **Offline Resilient**: Works without internet  
✅ **Well Logged**: Clear diagnostic messages  
✅ **Migration Optional**: No forced migration required  

The app will **always start** even if:
- Firestore document is missing
- Required fields are missing
- Firebase is not initialized
- Device is offline
- Firestore rules block access

Force update only blocks when **all conditions are met**:
1. Firebase initialized ✅
2. Firestore accessible ✅
3. Config document exists ✅
4. Required fields present ✅
5. `force_update` = true ✅
6. Current build < min_build_number ✅
