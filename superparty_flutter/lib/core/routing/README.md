# Routing

Router declarativ cu go_router.

## Status

✅ Router creat (`app_router.dart`)  
⏳ Integrare în main.dart (păstrăm MaterialApp.onGenerateRoute pentru compatibilitate)

## Migrare

Router-ul este pregătit pentru integrare. Când DI e complet migrat:

1. Înlocuiește `MaterialApp` cu `MaterialApp.router` în `main.dart`
2. Folosește `routerConfig: createAppRouter()`
3. Mută logica de auth din `AuthWrapper` în `redirect` guards

## Compatibilitate

Router-ul normalizează automat rutele `/#/evenimente` → `/evenimente` pentru compatibilitate cu deep links.
