# Comenzi Exacte - Setup Flutter Completat ✅

## ✅ CE S-A FĂCUT AUTOMAT:

1. ✅ Fișiere zsh create (~/.zprofile și ~/.zshrc)
2. ✅ Homebrew configurat în PATH
3. ✅ Flutter instalat (versiunea 3.38.7)
4. ✅ CocoaPods instalat
5. ✅ Dependențele proiectului instalate (flutter pub get)

---

## 📋 COMENZI EXACTE PENTRU TINE:

### PASUL 1: Ieșire din prompt incomplet (dacă mai apare)

**Dacă vezi promptul ">" sau o comandă incompletă:**

```bash
Ctrl+C
```

**Verifică că promptul revine la:**
```
universparty@MacBook-Air-Ursache ... %
```

---

### PASUL 2: Reîncarcă shell-ul (pentru a aplica noile setări)

```bash
exec zsh -l
```

**Output așteptat:** Prompt normal, fără erori.

---

### PASUL 3: Verifică că totul funcționează

```bash
flutter --version
```

**Output așteptat:**
```
Flutter 3.38.7 • channel stable • ...
```

```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
```

**Output așteptat:** Nu ar trebui să apară erori.

---

### PASUL 4: Rulează aplicația pe iOS Simulator

**Opțiunea A: Pornește Simulator manual, apoi rulează aplicația**

```bash
open -a Simulator
```

**Așteaptă 10-30 secunde** până se deschide Simulator.

**Apoi rulează:**

```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run
```

**Output așteptat:**
- Aplicația se compilează
- Se pornește în Simulator
- Vezi aplicația rulând

---

**Opțiunea B: Flutter pornește automat Simulator**

```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run
```

**Flutter va detecta automat un simulator disponibil și îl va porni.**

---

### PASUL 5: Rulează aplicația pe Android (opțional)

**Dacă ai configurat Android Studio (vezi ANDROID_STUDIO_SETUP_MACOS.md):**

**1. Pornește Android Emulator din Android Studio:**
   - Deschide Android Studio
   - Tools → Device Manager
   - Click ▶️ pe AVD-ul tău

**2. Verifică că emulatorul rulează:**

```bash
adb devices
```

**Output așteptat:**
```
List of devices attached
emulator-5554    device
```

**3. Rulează aplicația:**

```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run
```

---

## 🔧 COMENZI DE VERIFICARE

**Verifică status Flutter:**

```bash
flutter doctor
```

**Verifică dispozitive disponibile:**

```bash
flutter devices
```

**Verifică simulatoare iOS:**

```bash
xcrun simctl list devices available
```

**Verifică că ești în folderul corect:**

```bash
pwd
ls pubspec.yaml
```

**Output așteptat:**
```
/Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
pubspec.yaml
```

---

## ⚠️ TROUBLESHOOTING

### Eroare: "zsh: parse error near ')'"

**Soluție:**
```bash
exec zsh -l
```

**Dacă persistă:**
```bash
history | tail -20
```
Caută comenzi incomplete și șterge-le cu `history -d <număr>`.

---

### Eroare: "command not found: flutter"

**Soluție:**
```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
exec zsh -l
flutter --version
```

---

### Eroare: "No devices found"

**Pentru iOS:**
```bash
open -a Simulator
# Așteaptă 10-30 secunde
flutter devices
```

**Pentru Android:**
- Pornește emulator din Android Studio
- Apoi: `flutter devices`

---

### Eroare: "CocoaPods not installed"

**Soluție (deja instalat, dar verifică):**
```bash
pod --version
```

**Output așteptat:** `1.16.2` (sau similar)

**Dacă nu apare:**
```bash
brew install cocoapods
```

---

### Eroare la compilare iOS

**Soluție:**
```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter/ios
pod install
cd ..
flutter clean
flutter pub get
flutter run
```

---

## 📝 REZUMAT RAPID

**Pentru a rula aplicația acum:**

```bash
# 1. Reîncarcă shell (dacă e necesar)
exec zsh -l

# 2. Navighează la proiect
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter

# 3. Pornește Simulator (opțional - Flutter poate porni automat)
open -a Simulator

# 4. Rulează aplicația
flutter run
```

---

## ✅ STATUS FINAL

- ✅ zsh configurat corect
- ✅ Homebrew în PATH
- ✅ Flutter 3.38.7 instalat
- ✅ CocoaPods instalat
- ✅ Dependențele proiectului instalate
- ✅ Xcode instalat
- ✅ Simulatoare iOS disponibile
- ✅ Proiect găsit: `~/Aplicatie-SuperpartyByAi/superparty_flutter`

**Gata de rulare!** 🚀

---

## 📚 FIȘIERE DE REFERINȚĂ

- `ANDROID_STUDIO_SETUP_MACOS.md` - Setup Android Studio minimal
- `FIX_ZSH_FLUTTER.md` - Ghid detaliat pentru fix zsh și Flutter
