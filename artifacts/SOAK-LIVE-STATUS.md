=== SOAK LIVE STATUS (10 MIN) ===
RunID: 
Started: 2025-12-29T18:49:21+00:00

First 10 heartbeats:
Error: Cannot find module 'firebase-admin'
Require stack:
- /workspaces/Aplicatie-SuperpartyByAi/artifacts/soak-firestore.js
    at Function._resolveFilename (node:internal/modules/cjs/loader:1383:15)
    at defaultResolveImpl (node:internal/modules/cjs/loader:1025:19)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1030:22)
    at Function._load (node:internal/modules/cjs/loader:1192:37)
    at TracingChannel.traceSync (node:diagnostics_channel:322:14)
    at wrapModuleLoad (node:internal/modules/cjs/loader:237:24)
    at Module.require (node:internal/modules/cjs/loader:1463:12)
    at require (node:internal/modules/helpers:147:16)
    at Object.<anonymous> (/workspaces/Aplicatie-SuperpartyByAi/artifacts/soak-firestore.js:8:15)
    at Module._compile (node:internal/modules/cjs/loader:1706:14) {
  code: 'MODULE_NOT_FOUND',
  requireStack: [
    '/workspaces/Aplicatie-SuperpartyByAi/artifacts/soak-firestore.js'
  ]
}

Node.js v22.19.0
