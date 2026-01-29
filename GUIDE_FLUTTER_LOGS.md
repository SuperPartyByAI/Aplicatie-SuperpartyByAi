# 📱 Cum să vezi log-urile Flutter în emulator

## 🚀 Metoda 1: Terminal (cea mai simplă)

### Pas 1: Verifică emulatorul
```bash
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter devices
```
Ar trebui să vezi ceva de genul:
```
emulator-5554 • Android SDK built for x86_64 • android-x86_64
```

### Pas 2: Rulează app cu logs
```bash
flutter run --verbose
```

Sau dacă știi ID-ul emulatorului:
```bash
flutter run -d emulator-5554 --verbose
```

**Toate erorile vor apărea direct în terminal!** 🔍

---

## 📋 Metoda 2: Doar logs (fără să rulezi app din nou)

Dacă app-ul rulează deja:
```bash
flutter logs
```

---

## 🔍 Metoda 3: Android Logcat (detaliat)

### Filtrat pentru Flutter/WhatsApp:
```bash
adb logcat | grep -iE "flutter|dart|error|exception|whatsapp|api"
```

### Toate erorile recente:
```bash
adb logcat -d | grep -iE "error|exception|fatal" | tail -50
```

---

## 🖥️ Metoda 4: VS Code / Cursor (Debug Console)

1. Deschide VS Code/Cursor în proiectul Flutter
2. Apasă `F5` sau rulează "Run > Start Debugging"
3. Deschide **Debug Console** (View > Debug Console)
4. Toate log-urile și erorile apar acolo în timp real

---

## ⚡ Comandă rapidă pentru debugging WhatsApp

```bash
# Rulează app + salvează logs într-un fișier
cd /Users/universparty/Aplicatie-SuperpartyByAi/superparty_flutter
flutter run -d emulator-5554 --verbose 2>&1 | tee flutter_debug.log
```

Apoi poți căuta în `flutter_debug.log`:
```bash
grep -iE "error|exception|whatsapp|api|failed" flutter_debug.log
```

---

## 🎯 Ce să cauți în logs

Când vezi o eroare în app, caută în logs:

1. **Erori HTTP (404, 429, 502):**
   ```
   ERROR: Failed to fetch accounts
   Exception: 404 Not Found
   ```

2. **Erori de rețea:**
   ```
   SocketException
   Connection timeout
   ```

3. **Erori de API:**
   ```
   whatsapp_api_service
   addAccount
   regenerateQR
   ```

4. **Stack traces:**
   ```
   #0      whatsapp_api_service.dart:123
   #1      whatsapp_accounts_screen.dart:456
   ```

---

## 📸 Alternativ: Screenshot din emulator

Dacă log-urile sunt prea multe, poți face screenshot din emulator:
- Android: `Cmd + S` sau click pe camera icon în toolbar
- iOS: `Cmd + S`

---

## ✅ Verificare rapidă backend

Înainte de a debuga app-ul, verifică backend-ul:
```bash
curl https://whats-app-ompro.ro/health
curl https://whats-app-ompro.ro/ready
curl https://whats-app-ompro.ro/api/whatsapp/accounts
```

