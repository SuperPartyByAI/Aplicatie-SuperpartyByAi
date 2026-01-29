# 🔐 Cum să obții Personal/Team Token pentru automatizare

## Pasul 1: Creează Personal Token

1. **Deschide:** https://legacy hosting.app/account/tokens
   
   SAU:
   
   - legacy hosting Dashboard → Click pe profil (colț dreapta sus)
   - Settings → Tokens

2. **IMPORTANT:** Selectează "**Personal**" (NU "Project"!)

3. Click pe butonul "**New Token**" sau "**+ New Token**"

4. **Numează-l:** ex. `cursor-whatsapp-setup` sau `auto-setup`

5. Click "**Create Token**"

6. **⚠️ COPIAZĂ TOKEN-UL** (apare o singură dată! Nu îl vei mai vedea!)

   Token-ul arată așa: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

---

## Pasul 2: Dă-mi token-ul

După ce ai copiat token-ul, dă-mi-l în chat și voi:

✅ Verifica autentificarea  
✅ Crea volume-ul `whatsapp-sessions-volume` la `/data/sessions`  
✅ Setea variabila `SESSIONS_PATH=/data/sessions`  
✅ Verifica configurarea finală  

---

## Diferență: Personal Token vs Project Token

### ❌ Project Token (ce ai acum)
- **Scope:** Doar un proiect specific
- **Permisiuni:** ❌ NU poate crea volume
- **Permisiuni:** ❌ NU poate seta variabile
- **Folosire:** Doar pentru deploy/read

### ✅ Personal/Team Token (ce îți trebuie)
- **Scope:** Toate proiectele din cont
- **Permisiuni:** ✅ Poate crea volume
- **Permisiuni:** ✅ Poate seta variabile
- **Permisiuni:** ✅ Poate face mutații (mutation-uri GraphQL)

---

## Securitate

- Token-ul Personal are acces la **toate proiectele** tale
- Nu-l partaja public sau în commit-uri Git
- Poți să-l ștergi după ce configurez totul
- Sau îl poți păstra pentru automatizări viitoare

---

**După ce ai token-ul Personal, dă-mi-l în chat și configurez totul automat!** 🚀
