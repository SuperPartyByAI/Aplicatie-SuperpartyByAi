# 🔧 FIX: "Could not find root directory: whatsapp-backend"

## ❌ Problema

Eroare: `Could not find root directory: whatsapp-backend`

## 🔍 Cauza

Railway CLI a fost link-at din `whatsapp-backend/`, dar `railway.json` e la **root-ul proiectului** (`/Users/universparty/Aplicatie-SuperpartyByAi/railway.json`).

`railway.json` referă `whatsapp-backend` ca subdirector:
```json
{
  "build": {
    "buildCommand": "cd whatsapp-backend && npm install"
  },
  "deploy": {
    "startCommand": "cd whatsapp-backend && node server.js"
  }
}
```

Când Railway CLI rulează din `whatsapp-backend/`, caută `whatsapp-backend` în directorul curent și nu îl găsește.

---

## ✅ Soluție: Link Railway din Root

### Pasul 1: Navighează la root-ul proiectului

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
```

### Pasul 2: Link Railway (dacă nu e deja link-at)

```bash
railway link
```

**Selectează:**
- Workspace: superpartybyai's Projects
- Project: Whats Upp
- Environment: production
- Service: Whats Upp (sau ESC pentru a skip dacă e singleton)

### Pasul 3: Verificare

```bash
railway status
```

**Ar trebui să vezi:**
```
Project: Whats Upp
Environment: production
Service: Whats Upp
```

### Pasul 4: Setează ADMIN_TOKEN (dacă necesar)

```bash
railway variables set ADMIN_TOKEN="8df59afe1ca9387674e2b72c42460e3a3d2dea96833af6d3d9b840ff48ddfea3"
```

### Pasul 5: Deploy

```bash
railway up
```

SAU pentru detach mode:
```bash
railway up --detach
```

---

## 📝 Comenzi din Root

**Din root (`/Users/universparty/Aplicatie-SuperpartyByAi/`):**

```bash
# Status
railway status

# Variables
railway variables

# Set variable
railway variables set ADMIN_TOKEN="token-value"

# Deploy
railway up

# Logs
railway logs

# Restart (dacă disponibil)
railway restart
```

---

## 🔍 Diagnostic

**Dacă încă primești eroarea:**

1. **Verifică unde e `railway.json`**:
   ```bash
   find . -name "railway.json" -type f
   ```

2. **Verifică link-ul Railway**:
   ```bash
   railway status
   ```

3. **Verifică `.railway/` directory**:
   ```bash
   ls -la .railway/ 2>/dev/null || echo "Nu există .railway/ în root"
   ```

4. **Relink dacă e necesar**:
   ```bash
   rm -rf .railway/
   railway link
   ```

---

## ✅ Verificare Finală

După link din root:

```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi
railway status
railway variables | grep ADMIN_TOKEN
```

**Ar trebui să funcționeze fără erori!**

---

**După link din root, toate comenzile Railway ar trebui să funcționeze corect! 🚀**
