# ⚠️ ATENȚIE: Unde să creezi variabilele

## ❌ NU AICI (Project Settings → Shared Variables)

**NU** creezi variabila în:
- Project Settings → Shared Variables

**De ce nu?**
- Shared Variables sunt partajate între toate serviciile
- `SESSIONS_PATH` este specifică pentru `whatsapp-backend` doar
- Alte servicii nu au nevoie de această variabilă

---

## ✅ AICI (Service Specific → Variables)

**DA, creează variabila în:**
- Service: `whatsapp-backend`
- Tab: **"Variables"** (nu "Shared Variables")

### Cum să ajungi acolo:

1. **Părăsește** Project Settings (click pe "←" sau numele proiectului)
2. **Click** pe service-ul **`whatsapp-backend`** (nu project settings!)
3. **Click** pe tab-ul **"Variables"** (din service-ul specific)
4. **Acolo** vei vedea variabilele de serviciu (nu partajate)

---

## Locul corect în Railway

```
Railway Dashboard
└── Project: "Whats Upp"
    └── Service: "whatsapp-backend"  ← AICI!
        ├── Deployments
        ├── Metrics
        ├── Variables  ← VARIABILE DE SERVICIU (aici!)
        ├── Volumes    ← AICI creezi volume-ul!
        └── Settings
```

**NU:**
```
Railway Dashboard
└── Project Settings
    └── Shared Variables  ← NU AICI!
```

---

## Checklist Configurare Corectă

### 1. Variabilă de serviciu (NU partajată!)
- [x] Service: `whatsapp-backend`
- [x] Tab: "Variables" (nu "Shared Variables")
- [x] Key: `SESSIONS_PATH`
- [x] Value: `/data/sessions`

### 2. Volume Persistent (CRITIC!)
- [ ] Service: `whatsapp-backend`
- [ ] Tab: "**Volumes**" (nu "Variables")
- [ ] New Volume:
  - Name: `whatsapp-sessions-volume`
  - Mount Path: `/data/sessions`
  - Size: `1GB`
- [ ] Status: "Active"

---

## Pași corecți

### Pasul 1: Ieși din Project Settings
- Click pe numele proiectului sau "←" pentru a ieși
- Sau direct link: https://railway.app/project/be379927-9034-4a4d-8e35-4fbdfe258fc0/service/bac72d7a-eeca-4dda-acd9-6b0496a2184f

### Pasul 2: Deschide Service-ul
- Click pe service-ul `whatsapp-backend`

### Pasul 3: Verifică Variables (de serviciu)
- Tab "Variables" (din service, nu project!)
- Ar trebui să vezi `SESSIONS_PATH=/data/sessions` (dacă ai creat-o corect)
- Dacă nu există, creează-o aici (nu în Shared Variables)

### Pasul 4: Creează Volume
- Tab "**Volumes**" (din service)
- New Volume → Completează → Create
- Așteaptă status "Active"

---

## Diferență: Service Variables vs Shared Variables

### Service Variables (CE TREBUIE!)
- **Unde:** Service-specific → Tab "Variables"
- **Scope:** Doar service-ul respectiv
- **Folosire:** `SESSIONS_PATH` pentru `whatsapp-backend` doar
- **Exemplu:** Fiecare service poate avea variabile diferite

### Shared Variables (NU!)
- **Unde:** Project Settings → Shared Variables
- **Scope:** Toate serviciile din proiect
- **Folosire:** Pentru variabile comune (ex: `DATABASE_URL`)
- **Problema:** `SESSIONS_PATH` nu e comună, e specifică whatsapp-backend

---

**REZUMAT:** Mergi la service-ul `whatsapp-backend` → Tab "Variables" (nu Project Settings → Shared Variables)
