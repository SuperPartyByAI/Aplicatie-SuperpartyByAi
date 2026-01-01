# 🚀 DEPLOY v7.0 ACUM - MANUAL (5 MINUTE)

## ⚡ RAPID - URMEAZĂ EXACT

---

## PASUL 1: DESCHIDE RAILWAY

1. Deschide: https://railway.app/dashboard
2. Click **"New Project"**
3. Click **"Deploy from GitHub repo"**
4. Selectează: **Aplicatie-SuperpartyByAi**
5. Click **"Deploy Now"**

✅ Service creat

---

## PASUL 2: CONFIGUREAZĂ (3 CLICK-URI)

### A. Root Directory

1. Click pe service-ul creat
2. **Settings** (tab)
3. Scroll la **"Source"**
4. **Root Directory:** scrie `monitoring`
5. Click **"Update"**

### B. Start Command

1. Tot în Settings
2. Scroll la **"Deploy"**
3. **Start Command:** scrie `npm start`
4. Click **"Update"**

### C. Variables

1. Click **"Variables"** (tab)
2. Click **"+ New Variable"**

Adaugă 3 variabile:

**Variabila 1:**

```
Variable name: RAILWAY_TOKEN
Value: 998d4e46-c67c-47e2-9eaa-ae4cc806aab1
```

Click **"Add"**

**Variabila 2:**

```
Variable name: PORT
Value: 3001
```

Click **"Add"**

**Variabila 3:**

```
Variable name: NODE_ENV
Value: production
```

Click **"Add"**

✅ Railway va redeploy automat

---

## PASUL 3: GENEREAZĂ DOMAIN

1. Click **"Settings"** (tab)
2. Scroll la **"Networking"**
3. Click **"Generate Domain"**
4. Copy URL-ul (ex: `v7-singularity.up.railway.app`)

✅ GATA!

---

## PASUL 4: VERIFICĂ

1. Deschide URL-ul în browser
2. Ar trebui să vezi dashboard-ul v7.0

SAU verifică health:

```
https://your-url.railway.app/health
```

---

## 🎉 DONE!

**Dashboard:** https://your-url.railway.app

**Dacă nu merge:**

- Verifică Logs (Deployments tab)
- Verifică că Root Directory = `monitoring`
- Verifică că Start Command = `npm start`

**Spune-mi URL-ul când e gata!** 🚀
