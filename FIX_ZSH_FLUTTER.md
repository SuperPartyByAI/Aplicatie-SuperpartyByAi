# Fix zsh și Setup Flutter - Pași Exacti

## PASUL 1: Ieșire din prompt incomplet

**Dacă vezi promptul ">" sau o comandă incompletă:**

1. Apasă **Ctrl+C** (de câteva ori dacă e necesar)
2. Verifică că promptul revine la: `universparty@MacBook-Air-Ursache ... %`

**Dacă nu funcționează, închide și redeschide Terminal.**

---

## PASUL 2: Verificare și fix zsh config

**Rulează această comandă pentru a verifica dacă există erori:**

```bash
zsh -n ~/.zshrc 2>&1 || echo "No .zshrc file"
zsh -n ~/.zprofile 2>&1 || echo "No .zprofile file"
```

**Dacă vezi erori, continuă cu pașii de mai jos.**

---

## PASUL 3: Creează/Repară fișierele zsh

**Creează ~/.zprofile cu Homebrew PATH:**

```bash
cat > ~/.zprofile << 'EOF'
# Homebrew
eval "$(/opt/homebrew/bin/brew shellenv)"
EOF
```

**Creează ~/.zshrc minimal:**

```bash
cat > ~/.zshrc << 'EOF'
# Load zprofile
if [ -f ~/.zprofile ]; then
    source ~/.zprofile
fi

# Flutter PATH (va fi adăugat după instalare)
# export PATH="$PATH:$HOME/flutter/bin"
EOF
```

**Reîncarcă shell-ul:**

```bash
exec zsh -l
```

**Verifică că nu mai sunt erori:**

```bash
echo "Shell loaded successfully"
```

**Output așteptat:** `Shell loaded successfully`

---

## PASUL 4: Verifică Homebrew

**Rulează:**

```bash
brew --version
```

**Output așteptat:** `Homebrew 5.0.10` (sau versiune similară)

**Dacă apare "command not found":**

```bash
eval "$(/opt/homebrew/bin/brew shellenv)"
brew --version
```

---

## PASUL 5: Instalează Flutter

**Rulează:**

```bash
brew install flutter
```

**Așteaptă finalizarea instalării (poate dura 2-5 minute).**

**Verifică instalarea:**

```bash
flutter --version
```

**Output așteptat:** Versiune Flutter (ex: `Flutter 3.x.x`)

**Verifică configurarea:**

```bash
flutter doctor
```

**Output așteptat:** Status pentru diferite platforme (iOS, Android, etc.)

---

## PASUL 6: Adaugă Flutter la PATH (dacă e necesar)

**Flutter instalat prin Homebrew este deja în PATH, dar verifică:**

```bash
which flutter
```

**Output așteptat:** `/opt/homebrew/bin/flutter` sau `/usr/local/bin/flutter`

**Dacă nu apare, adaugă manual în ~/.zshrc:**

```bash
echo 'export PATH="$PATH:/opt/homebrew/bin"' >> ~/.zshrc
exec zsh -l
```

---

## PASUL 7: Navighează la proiectul Flutter

**Rulează:**

```bash
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
```

**Verifică că ești în folderul corect:**

```bash
ls pubspec.yaml
```

**Output așteptat:** `pubspec.yaml` (fișierul este listat)

---

## PASUL 8: Instalează dependențele Flutter

**Rulează:**

```bash
flutter pub get
```

**Output așteptat:** 
```
Resolving dependencies...
Got dependencies!
```

**Dacă apare eroare, spune-mi exact mesajul.**

---

## PASUL 9: Verifică dispozitive disponibile

**Pentru iOS (dacă ai Xcode):**

```bash
xcode-select -p
```

**Output așteptat:** `/Applications/Xcode.app/Contents/Developer` sau `/Library/Developer/CommandLineTools`

**Listează simulatoare iOS:**

```bash
xcrun simctl list devices available | head -20
```

**Pentru Android:**

```bash
flutter doctor --android-licenses
```

**Acceptă licențele apăsând `y` și Enter.**

---

## PASUL 10: Rulează aplicația

### Opțiunea A: iOS Simulator

**1. Pornește Simulator:**

```bash
open -a Simulator
```

**2. Așteaptă să pornească Simulator (10-30 secunde).**

**3. Rulează aplicația:**

```bash
flutter run
```

**Output așteptat:** Aplicația se compilează și pornește în simulator.

### Opțiunea B: Android Emulator

**1. Pornește Android Studio și creează/pornește un AVD (vezi ghidul ANDROID_STUDIO_SETUP_MACOS.md).**

**2. Verifică că emulatorul rulează:**

```bash
adb devices
```

**Output așteptat:** Listă cu dispozitive (ex: `emulator-5554`)

**3. Rulează aplicația:**

```bash
flutter run
```

---

## Troubleshooting

### Eroare: "zsh: parse error near ')'"

**Cauză:** O comandă incompletă sau coruptă în istoric sau alias.

**Soluție:**
1. Apasă Ctrl+C pentru a ieși
2. Rulează: `exec zsh -l` pentru a reîncărca shell-ul
3. Dacă persistă, verifică istoricul: `history | tail -20`

### Eroare: "command not found: flutter"

**Cauză:** Flutter nu este în PATH.

**Soluție:**
```bash
which flutter
# Dacă nu găsește nimic:
brew install flutter
# Apoi:
exec zsh -l
flutter --version
```

### Eroare: "No devices found"

**Soluție:**
- **iOS:** Pornește Simulator: `open -a Simulator`
- **Android:** Pornește emulator din Android Studio sau: `flutter emulators --launch <emulator_id>`

### Eroare la "flutter pub get"

**Soluție:**
```bash
flutter clean
flutter pub get
```

---

## Comenzi Rapide de Verificare

```bash
# Verifică shell
echo $SHELL
exec zsh -l

# Verifică Homebrew
brew --version

# Verifică Flutter
flutter --version
flutter doctor

# Verifică proiect
cd ~/Aplicatie-SuperpartyByAi/superparty_flutter
ls pubspec.yaml

# Verifică dispozitive
flutter devices
```

---

## Rezumat Pași Rapizi

1. **Ctrl+C** (ieșire din prompt incomplet)
2. **exec zsh -l** (reîncarcă shell)
3. **brew install flutter** (instalează Flutter)
4. **cd ~/Aplicatie-SuperpartyByAi/superparty_flutter** (navighează la proiect)
5. **flutter pub get** (instalează dependențe)
6. **open -a Simulator** (pornește iOS Simulator - opțional)
7. **flutter run** (rulează aplicația)
