# ✅ Verificare Finală Configurare legacy hosting

## Ce ai configurat până acum

### ✅ Variabilă de Mediu
- **Key:** `SESSIONS_PATH` ✅ (Corect!)
- **Value:** `/data/sessions` ✅ (Corect!)
- **Tip:** Variabilă de serviciu (NU partajată) ✅ (Corect!)

### ❓ Volume Persistent
- **Verificare necesară:** Există volume montat la `/data/sessions`?

---

## Checklist Final

### 1. Variabilă `SESSIONS_PATH` ✅
- [x] Key: `SESSIONS_PATH` (NU `whatsapp-sessions-volume`)
- [x] Value: `/data/sessions`
- [x] Tip: Variabilă de serviciu (NU partajată)

### 2. Volume Persistent (VERIFICĂ!)
- [ ] **Tab "Volumes"** (nu "Variables") → Există volume montat?
  - Name: `whatsapp-sessions-volume` (sau similar)
  - Mount Path: `/data/sessions`
  - Status: "Active"

### 3. Verificare Health Endpoint
- [ ] Health endpoint returnează: `"sessions_dir_writable": true`
- [ ] Status: `"ok": true`

---

## Verificare Rapidă

### În legacy hosting Dashboard

1. **Verifică Volume:**
   - Tab "**Volumes**" (stânga)
   - Există un volume cu mount path `/data/sessions`?
   - Status este "Active" (verde)?

2. **Verifică Variables:**
   - Tab "**Variables**" (stânga)
   - Există `SESSIONS_PATH=/data/sessions`?
   - **NU** este partajată (shared)?

### Prin Health Endpoint

```bash
curl https://whats-app-ompro.ro/health | jq
```

**Așteptat:**
```json
{
  "ok": true,
  "sessions_dir_writable": true,
  "status": "healthy"
}
```

---

## Dacă lipsește Volume-ul

**CRITIC:** Fără volume persistent, datele se pierd la restart!

**Soluție:**

1. Tab "**Volumes**" (nu "Variables")
2. Click "New Volume" sau "+"
3. Completează:
   - **Name:** `whatsapp-sessions-volume`
   - **Mount Path:** `/data/sessions` (EXACT același path ca `SESSIONS_PATH`!)
   - **Size:** `1GB`
4. Click "Create"
5. Așteaptă status "Active" (1-2 minute)

---

## După verificare

✅ **Dacă ai AMBELE (Volume + `SESSIONS_PATH`):**
- legacy hosting va redeploy automat
- Service-ul va porni corect
- Health endpoint va returna `"sessions_dir_writable": true`

❌ **Dacă lipsește Volume-ul:**
- Service-ul va da eroare 502
- Health endpoint va returna `"sessions_dir_writable": false`
- Trebuie să creezi Volume-ul!

---

## Test Rapid

După configurare, testează:

```bash
cd ~/Aplicatie-SuperpartyByAi
./test-health.sh
```

Sau manual:
```bash
curl https://whats-app-ompro.ro/health | jq .sessions_dir_writable
```

**Așteptat:** `true` ✅
