# Voci Disponibile GRATUITE în Twilio

## 🎯 Voci Google Wavenet (Română) - GRATUITE

### Voci Feminine:

#### 1. **Google.ro-RO-Wavenet-A** (ACUM ACTIV)
- **Gen:** Femeie
- **Ton:** Profesional, cald
- **Vârstă:** Adult (30-40 ani)
- **Recomandat pentru:** Call center, suport clienți
- **Cod:** `Google.ro-RO-Wavenet-A`

#### 2. **Google.ro-RO-Standard-A**
- **Gen:** Femeie
- **Ton:** Neutru, profesional
- **Vârstă:** Adult (25-35 ani)
- **Calitate:** Mai slabă decât Wavenet (mai robotizat)
- **Cod:** `Google.ro-RO-Standard-A`

---

### Voci Masculine:

#### 3. **Google.ro-RO-Wavenet-B**
- **Gen:** Bărbat
- **Ton:** Profesional, autoritar
- **Vârstă:** Adult (35-45 ani)
- **Recomandat pentru:** Anunțuri oficiale
- **Cod:** `Google.ro-RO-Wavenet-B`

#### 4. **Google.ro-RO-Standard-B**
- **Gen:** Bărbat
- **Ton:** Neutru
- **Vârstă:** Adult (30-40 ani)
- **Calitate:** Mai slabă decât Wavenet
- **Cod:** `Google.ro-RO-Standard-B`

---

## 🎯 Voci Amazon Polly (Română) - GRATUITE

### Voci Feminine:

#### 5. **Polly.Carmen** (VECHI - robotizat)
- **Gen:** Femeie
- **Ton:** Robotizat
- **Calitate:** 4/10
- **Cod:** `Polly.Carmen`

---

## 📊 Comparație Calitate:

| Voce | Naturalețe | Fluent | Robotizat | Recomandat |
|------|------------|--------|-----------|------------|
| **Google.ro-RO-Wavenet-A** | 8/10 | ✅ | ❌ | ✅ DA |
| **Google.ro-RO-Wavenet-B** | 8/10 | ✅ | ❌ | ✅ DA |
| **Google.ro-RO-Standard-A** | 6/10 | ⚠️ | ⚠️ | ⚠️ OK |
| **Google.ro-RO-Standard-B** | 6/10 | ⚠️ | ⚠️ | ⚠️ OK |
| **Polly.Carmen** | 4/10 | ❌ | ✅ | ❌ NU |

---

## 🎯 Recomandarea mea:

### Pentru Call Center (operator feminin):
**Google.ro-RO-Wavenet-A** ← ACUM ACTIV

### Pentru Anunțuri (voce masculină):
**Google.ro-RO-Wavenet-B**

---

## 🔧 Cum testezi fiecare voce:

### Metoda 1: Schimb eu în cod (RAPID)

Spune-mi ce voce vrei și o schimb în 30 secunde:
- "Pune Wavenet-B" (masculin)
- "Pune Standard-A" (feminin mai robotizat)
- etc.

### Metoda 2: Test manual în Twilio Studio (TU)

1. Mergi la: https://console.twilio.com/us1/develop/studio/flows
2. Creează Flow nou
3. Adaugă widget "Say/Play"
4. Testează fiecare voce:
   ```
   Voice: Google.ro-RO-Wavenet-A
   Text: "Bună ziua, SuperParty. Cu ce vă pot ajuta?"
   ```
5. Click "Test" și ascultă

---

## 🎧 Demo online (ascultă înainte):

### Google Cloud TTS Demo:
https://cloud.google.com/text-to-speech

1. Selectează limba: **Romanian (Romania)**
2. Selectează voce: **ro-RO-Wavenet-A**
3. Scrie text: "Bună ziua, SuperParty. Cu ce vă pot ajuta?"
4. Click "Speak it"
5. Ascultă și compară cu alte voci

---

## 💰 Cost:

**TOATE vocile de mai sus:** $0 extra (incluse în Twilio)

**Singura diferență:** Wavenet sună mai bine decât Standard, dar costă la fel!

---

## ❓ Ce vrei să fac?

**A)** Rămâi cu **Wavenet-A** (feminin, profesional) - ACUM ACTIV

**B)** Schimb la **Wavenet-B** (masculin, autoritar)

**C)** Testezi tu în Twilio Studio toate vocile

**D)** Testezi pe demo Google Cloud (link mai sus)

**Spune-mi!**
