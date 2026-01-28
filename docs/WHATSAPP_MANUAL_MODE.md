# WhatsApp Web Manual Mode

## Overview

Manual mode allows operators to manage WhatsApp Web sessions via Firefox containers without requiring backend integration (Hetzner/Baileys). This mode is useful when:

- Backend services are unavailable
- You want to use WhatsApp Web manually without AI features
- Testing Firefox container integration
- Operators prefer direct WhatsApp Web access

**Important:** In manual mode, conversations are **NOT** synced into the Flutter app. They are only visible in Firefox and on the phone.

## Setup

### 1. Enable Manual Mode

Build the app with the manual-only flag:

```bash
flutter run --dart-define=WA_MANUAL_ONLY=true
```

Or for release builds:

```bash
flutter build macos --dart-define=WA_MANUAL_ONLY=true
```

### 2. Configure Accounts

Create your accounts file:

```bash
cp superparty_flutter/assets/whatsapp_manual_accounts.example.json \
   superparty_flutter/assets/whatsapp_manual_accounts.json
```

Edit `whatsapp_manual_accounts.json` with your real phone numbers:

```json
[
  {
    "index": 1,
    "label": "WA-01",
    "phone": "+40712345678",
    "container": "WA-01",
    "color": "orange",
    "icon": "fruit"
  },
  ...
]
```

**Fields:**
- `index`: Unique account index (1-30)
- `label`: Display label (e.g., "WA-01")
- `phone`: Phone number in E.164 format (e.g., "+40712345678")
- `container`: Firefox container name (e.g., "WA-01")
- `color`: Container color (blue, orange, green, red, purple, pink, yellow, turquoise)
- `icon`: Container icon (circle, fruit, square, triangle)

### 3. Install Firefox Container Script

The app uses `scripts/wa_web_launcher/firefox-container` to open Firefox containers.

Ensure the script exists and is executable:

```bash
# Check if script exists
ls -la scripts/wa_web_launcher/firefox-container

# Make it executable if needed
chmod +x scripts/wa_web_launcher/firefox-container
```

### 4. Set Signing Key (Optional)

To avoid Firefox confirmation dialogs, set the signing key:

```bash
export OPEN_URL_IN_CONTAINER_SIGNING_KEY="your-signing-key-here"
```

Or in VSCode `launch.json`:

```json
{
  "configurations": [
    {
      "name": "Flutter (Manual Mode)",
      "request": "launch",
      "type": "dart",
      "args": [
        "--dart-define=WA_MANUAL_ONLY=true"
      ],
      "env": {
        "OPEN_URL_IN_CONTAINER_SIGNING_KEY": "your-signing-key-here"
      }
    }
  ]
}
```

## Usage

### Opening WhatsApp Web

1. Launch the app with `WA_MANUAL_ONLY=true`
2. The app shows only the manual accounts list
3. Click "Open WhatsApp Web" for any account
4. Firefox opens WhatsApp Web in the specified container
5. Scan QR code with your phone

### Available Actions

- **Open WhatsApp Web**: Opens WhatsApp Web in Firefox container
- **Open QR**: Opens WhatsApp Web directly in browser (fallback)
- **Copy Phone**: Copies phone number to clipboard
- **Test Firefox**: Opens a test container (developer tool)
- **Diagnostics**: Shows launcher script status and configuration

### Limitations

- **No message syncing**: Conversations are NOT visible inside the app
- **No AI features**: Backend integration is disabled
- **macOS only**: Firefox containers only work on macOS
- **Manual QR scanning**: You must scan QR codes manually on each phone

## Diagnostics

### Run Diagnostics

Click the "Diagnostics" button (bug icon) in the app bar to check:

- ✅ Platform compatibility (macOS)
- ✅ Launcher script exists and is executable
- ✅ Signing key present/absent
- ✅ Firefox installation

### Test Firefox

Click the "Test Firefox" button (science icon) to open a test container. This verifies that Firefox container integration works.

## Troubleshooting

### Script Not Found

**Error:** `Firefox container launcher script not found`

**Fix:**
1. Ensure script exists: `ls -la scripts/wa_web_launcher/firefox-container`
2. Set `WA_WEB_LAUNCHER_PATH` environment variable to script path
3. Or ensure script is in repo root relative to Flutter app

### Script Not Executable

**Error:** `Script is not executable`

**Fix:**
```bash
chmod +x scripts/wa_web_launcher/firefox-container
```

### Firefox Confirmation Dialogs

**Issue:** Firefox shows confirmation dialog for each container open

**Fix:**
Set `OPEN_URL_IN_CONTAINER_SIGNING_KEY` environment variable (see Setup step 4)

### Accounts Not Loading

**Error:** `Failed to load accounts`

**Fix:**
1. Ensure `whatsapp_manual_accounts.json` exists in `assets/` folder
2. Check JSON syntax is valid
3. Verify `pubspec.yaml` includes the asset:
   ```yaml
   assets:
     - assets/whatsapp_manual_accounts.example.json
   ```

### Backend Features Still Visible

**Issue:** Backend accounts are still shown

**Fix:**
Ensure you're building with `--dart-define=WA_MANUAL_ONLY=true`. Check in `lib/core/config/env.dart` that `Env.waManualOnly` is `true`.

## Security

- **Never commit** `whatsapp_manual_accounts.json` with real phone numbers
- Use `whatsapp_manual_accounts.example.json` as template (committed)
- Ensure `.gitignore` excludes:
  - `assets/whatsapp_manual_accounts.json` (user-provided)
  - `OPEN_URL_IN_CONTAINER_SIGNING_KEY` (never log this value)
  - Session/auth artifacts

## Development

### Adding New Features

To add features specific to manual mode:

1. Check `Env.waManualOnly` flag
2. Add manual-mode-only UI/widgets
3. Ensure backend features are hidden when flag is set

### Testing

```bash
# Test manual mode
flutter run --dart-define=WA_MANUAL_ONLY=true -d macos

# Test backend mode (default)
flutter run -d macos
```

### Building

```bash
# Manual mode release
flutter build macos --dart-define=WA_MANUAL_ONLY=true

# Backend mode release (default)
flutter build macos
```

## FAQ

**Q: Can I switch between manual and backend mode?**

A: No, the mode is set at compile time via `--dart-define`. You need separate builds.

**Q: Do conversations sync in manual mode?**

A: No. Conversations are only visible in Firefox and on the phone. The app is just a launcher.

**Q: Can I use both modes simultaneously?**

A: No, they are mutually exclusive. Choose one mode per build.

**Q: What happens if backend is down in backend mode?**

A: Backend mode will show errors. Use manual mode if you need to work without backend.

**Q: Is manual mode available on Windows/Linux?**

A: No, Firefox containers only work on macOS. The UI will show a warning on other platforms.

## Related Documentation

- [Firefox Container Extension](https://github.com/honsiorovskyi/open-url-in-container)
- [WhatsApp Web](https://web.whatsapp.com)
- [Backend Integration](../whatsapp-backend/README.md)
