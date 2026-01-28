# ✅ Corectare Configurare legacy hosting

## Ce ai făcut până acum
- ✅ Variabilă de mediu: `whatsapp-sessions-volume` = `/data/sessions`

## Ce lipsește / Ce trebuie corectat

### ❌ Problema 1: Numele variabilei
**Ai creat:** `whatsapp-sessions-volume`  
**Trebuie să fie:** `SESSIONS_PATH`

**Soluție:**
- Tab "Variables" → Click pe variabila `whatsapp-sessions-volume`
- Schimbă "Key" în: `SESSIONS_PATH`
- Păstrează "Value" = `/data/sessions`
- Click "Save"

### ❌ Problema 2: Volume lipsă
**Ai creat:** Doar variabilă (nu volume)  
**Trebuie să ai:** Volume persistent montat la `/data/sessions`

**Soluție:**
- Tab "**Volumes**" (nu Variables!)
- Click "New Volume" sau "+"
- Completează:
  - **Name:** `whatsapp-sessions-volume`
  - **Mount Path:** `/data/sessions` (EXACT același path!)
  - **Size:** `1GB`
- Click "Create"
- Așteaptă status "Active" (verde)

---

## Checklist Final

- [ ] **Volume creat:**
  - Name: `whatsapp-sessions-volume`
  - Mount Path: `/data/sessions`
  - Size: `1GB`
  - Status: "Active" (verde)

- [ ] **Variabilă de mediu corectată:**
  - Key: `SESSIONS_PATH` (NU `whatsapp-sessions-volume`!)
  - Value: `/data/sessions`

---

## De ce sunt ambele necesare?

### Volume (Storage Persistent)
- **Ce face:** Creează un disc persistent în container
- **Unde:** Tab "Volumes" în legacy hosting
- **Rezultat:** Datele rămân chiar și după restart/redeploy

### Variabilă de mediu (`SESSIONS_PATH`)
- **Ce face:** Spune aplicației unde să scrie sesiunile
- **Unde:** Tab "Variables" în legacy hosting
- **Rezultat:** Codul știe să folosească path-ul `/data/sessions`

**Fără Volume:** Datele se pierd la restart  
**Fără `SESSIONS_PATH`:** Codul nu știe unde să scrie

**Ambele sunt CRITICE!** ✅

---

## După corectare

1. legacy hosting va redeploy automat după modificări
2. Verifică logs:
   ```bash
   curl https://whats-app-ompro.ro/health | jq
   ```
3. Caută în răspuns: `"sessions_dir_writable": true` ✅
