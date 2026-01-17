# 📦 Cum să creezi Volume în Railway

## Locuri unde poți crea Volume

### Opțiunea 1: Settings → Volumes (dacă există)

1. Click pe **"Settings"** (unde ești acum sau ai fost)
2. Caută în Settings o secțiune numită:
   - **"Volumes"**
   - **"Storage"**
   - **"Persistent Storage"**
   - **"Volume Mounts"**

### Opțiunea 2: Command Palette

1. Apasă **`⌘K`** (Mac) sau **`Ctrl+K`** (Windows/Linux)
2. Tastează: `volume` sau `mount`
3. Selectează opțiunea pentru a crea volume

### Opțiunea 3: Right-click pe Service Card

1. În dashboard-ul proiectului, **click dreapta** pe cardul service-ului `whatsapp-backend`
2. Caută opțiuni precum:
   - **"Attach Volume"**
   - **"Add Volume"**
   - **"Mount Storage"**

---

## Ce să cauți în Settings

Dacă ești în **Settings**, caută secțiuni precum:

- **"Storage"** sau **"Volumes"**
- **"Persistent Storage"**
- **"Volume Mounts"**

Dacă vezi butoane precum:
- **"Add Volume"**
- **"New Volume"**
- **"Attach Volume"**
- **"Mount Volume"**

→ Click pe ele!

---

## Ce să setezi când creezi Volume

Când găsești opțiunea de a crea volume, completează:

1. **Name:** `whatsapp-sessions-volume` (sau orice nume)
2. **Mount Path:** `/data/sessions` ⚠️ (EXACT același path ca `SESSIONS_PATH`!)
3. **Size:** `1GB` (suficient pentru 30 sesiuni)
4. Click **"Create"** sau **"Attach"**

---

## Verificare după creare

După ce creezi volume-ul, verifică:

1. Volume-ul apare în listă cu status "Active" (verde)
2. Mount Path este `/data/sessions`
3. Railway va redeploy automat

---

## Dacă NU găsești opțiunea pentru Volume

**Posibile motive:**

1. **Planul Railway:** Unele planuri pot avea restricții (rar)
2. **Locație UI:** Poate fi într-un loc neașteptat în Settings
3. **Permisiuni:** Poate ai nevoie de permisiuni admin

**Soluții:**

1. Verifică toate secțiunile din **Settings**
2. Încearcă **Command Palette** (`⌘K` sau `Ctrl+K`)
3. Contactează suport Railway (dacă ești sigur că planul permite volumes)

---

**Încearcă:** Mergi în **Settings** și caută toate secțiunile pentru "Volume", "Storage", "Mount"!
