# Test Report
- Timestamp: 2026-01-22T11:23:47.000000Z
- Branch: cursor/baileys-fix
- Head: 91e27931 fix(audit): support tsClient string window filtering + probe
- REAL_SYNC_READY: false
## Probe tsClient
```json
{"sample":[{"pathHash8":"51424043","tsLen":24,"tsHash8":"0f60f6a4","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"cc4718c8","tsLen":24,"tsHash8":"85938a95","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"7eabb58a","tsLen":24,"tsHash8":"1d37dd04","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"8ec6221c","tsLen":24,"tsHash8":"1df4f742","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"675e4823","tsLen":24,"tsHash8":"3258578b","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"b0e03933","tsLen":24,"tsHash8":"abd23241","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"3df1a3a0","tsLen":24,"tsHash8":"61e47d62","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"6ce500af","tsLen":24,"tsHash8":"303a71de","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"5c167f95","tsLen":24,"tsHash8":"c35ea3ea","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"1413f968","tsLen":24,"tsHash8":"ea75cbcf","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"fa9402b4","tsLen":24,"tsHash8":"590d65b5","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"dc42cdf3","tsLen":24,"tsHash8":"0942bce2","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"3c69eff7","tsLen":24,"tsHash8":"f49691a2","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"2f2a0df8","tsLen":24,"tsHash8":"74086f4e","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"2a786d47","tsLen":24,"tsHash8":"f9d15d30","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"1563154f","tsLen":24,"tsHash8":"94f882e1","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"b59c7342","tsLen":24,"tsHash8":"db30bbfc","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"b0ea1ae9","tsLen":24,"tsHash8":"5ed963a9","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"c145598d","tsLen":24,"tsHash8":"fd1e5ce7","category":"iso","parseOk":true,"ageBucket":"lt48h"},{"pathHash8":"70500d8a","tsLen":24,"tsHash8":"bb07f2e8","category":"iso","parseOk":true,"ageBucket":"lt48h"}],"stats":{"scanned":20,"parseOk":20,"parseFail":0,"categories":{"iso":20},"buckets":{"lt48h":20},"lenTop":{"24":20}}}
```
## Runner Restart
```json
{"duplicatesCountActiveBefore":0,"duplicatesCountActiveAfter":0,"before":{"duplicatesCountActive":0,"markedDocs":0,"activeDocs":0},"after":{"duplicatesCountActive":0,"markedDocs":0,"activeDocs":0},"delta":{"duplicatesCountActive":0},"usedFallback":false,"modeUsed":"desc","restartRequested":true,"restartPerformed":true,"restartVerified":true,"verdict":true}
```
## Audit 15m
```json
{"totalDocs":0,"markedDocs":0,"activeDocs":0,"uniqueKeys":0,"duplicatesCountActive":0,"duplicatesCountAll":null,"keyStrategyUsedCounts":{"stableKeyHash":0,"fingerprintHash":0,"fallback":0},"windowModeUsed":"clientSideWindow","parseFailures":0,"earliestAgeBucket":"ge48h","latestAgeBucket":"lt48h","windowHours":0.25,"limit":500,"keyMode":"stable","excludeMarked":true,"dryRun":false,"usedFallback":false,"modeUsed":"desc","hint":null,"indexLink":null,"duplicateGroupsCount":0,"topDuplicateGroups":[]}
```
## Audit 1h
```json
{"totalDocs":0,"markedDocs":0,"activeDocs":0,"uniqueKeys":0,"duplicatesCountActive":0,"duplicatesCountAll":null,"keyStrategyUsedCounts":{"stableKeyHash":0,"fingerprintHash":0,"fallback":0},"windowModeUsed":"clientSideWindow","parseFailures":0,"earliestAgeBucket":"ge48h","latestAgeBucket":"lt48h","windowHours":1,"limit":500,"keyMode":"stable","excludeMarked":true,"dryRun":false,"usedFallback":false,"modeUsed":"desc","hint":null,"indexLink":null,"duplicateGroupsCount":0,"topDuplicateGroups":[]}
```
## Audit 48h
```json
{"totalDocs":331,"markedDocs":2,"activeDocs":329,"uniqueKeys":329,"duplicatesCountActive":0,"duplicatesCountAll":null,"keyStrategyUsedCounts":{"stableKeyHash":331,"fingerprintHash":0,"fallback":0},"windowModeUsed":"clientSideWindow","parseFailures":0,"earliestAgeBucket":"ge48h","latestAgeBucket":"lt48h","windowHours":48,"limit":500,"keyMode":"stable","excludeMarked":true,"dryRun":false,"usedFallback":false,"modeUsed":"desc","hint":null,"indexLink":null,"duplicateGroupsCount":0,"topDuplicateGroups":[]}
```
## Recent Inbound Verdict
```json
{"sentinel":"recent_inbound","pass":false,"reason":"no_recent_docs","metrics":{"totalDocs":0,"duplicatesCountActive":0,"usedFallback":false,"stableKeyHash":0}}
```
