# Features

Feature-uri organizate pe straturi (Clean Architecture).

## Structură (per feature)

```
<feature_name>/
  ├── presentation/    # UI (screens, widgets)
  ├── application/     # Use cases, controllers
  ├── domain/          # Entities, repository interfaces
  └── data/            # Repository implementations, DTOs, mappers
```

## Ordine de migrare

1. Config/Versiune (cel mai simplu)
2. WhatsApp
3. Disponibilitate, Team, Salarizare
4. Evenimente, Dovezi
5. Admin, GM
6. Auth (la final)
