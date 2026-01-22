# Test Report
- Timestamp: 2026-01-22T01:50:36.628222Z
- Branch: cursor/baileys-fix
- Head: cd54afa9 chore: enable tsClient indexes + capture sync checks
- REAL_SYNC_READY: false
- REAL_SYNC_READY_reason: restart_not_verified
## Runner
```json
{"duplicatesCountActiveBefore": 70, "duplicatesCountActiveAfter": 70, "before": {"duplicatesCountActive": 70, "markedDocs": 2, "activeDocs": 498}, "after": {"duplicatesCountActive": 70, "markedDocs": 2, "activeDocs": 498}, "delta": {"duplicatesCountActive": 0}, "usedFallback": false, "modeUsed": "desc", "restartRequested": false, "restartPerformed": false, "restartVerified": false, "verdict": true}
```
## Runner Restart
```json
{"duplicatesCountActiveBefore": 70, "duplicatesCountActiveAfter": 70, "before": {"duplicatesCountActive": 70, "markedDocs": 2, "activeDocs": 498}, "after": {"duplicatesCountActive": 70, "markedDocs": 2, "activeDocs": 498}, "delta": {"duplicatesCountActive": 0}, "usedFallback": false, "modeUsed": "desc", "restartRequested": true, "restartPerformed": false, "restartError": "Command failed: bash -lc ./scripts/restart-backend-gcloud.sh\nUpdated property [core/project].\nDeploying...\nCreating Revision.........failed\nDeployment failed\nERROR: (gcloud.run.services.update) Image 'us-central1-docker.pkg.dev/superparty-frontend/gcf-artifacts/superparty--frontend__us--central1__whatsapp:version_1' not found.\n", "restartVerified": false, "verdict": false, "not_ready_reason": "restart_failed"}
```
## Audit 15m
```json
{"totalDocs": 500, "markedDocs": 2, "activeDocs": 498, "uniqueKeys": 428, "duplicatesCountActive": 70, "duplicatesCountAll": null, "keyStrategyUsedCounts": {"stableKeyHash": 0, "fingerprintHash": 0, "fallback": 500}, "windowHours": 0.25, "limit": 500, "keyMode": "stable", "excludeMarked": true, "dryRun": false, "usedFallback": false, "modeUsed": "desc", "hint": null, "indexLink": null}
```
## Audit 48h
```json
{"totalDocs": 500, "markedDocs": 2, "activeDocs": 498, "uniqueKeys": 428, "duplicatesCountActive": 70, "duplicatesCountAll": null, "keyStrategyUsedCounts": {"stableKeyHash": 0, "fingerprintHash": 0, "fallback": 500}, "windowHours": 48, "limit": 500, "keyMode": "stable", "excludeMarked": true, "dryRun": false, "usedFallback": false, "modeUsed": "desc", "hint": null, "indexLink": null}
```
## Audit Threads 48h
```json
{"totalThreads": 24, "uniqueKeys": 24, "duplicatesCount": 0, "topDuplicateGroups": [], "lidThreadsCount": 13, "canonicalThreadsCount": 16, "unknownNameCount": 3}
```
