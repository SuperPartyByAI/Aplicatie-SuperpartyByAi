# Firefox Preferences for Session Persistence

This document lists all Firefox settings required to ensure WhatsApp Web sessions persist across reboots and browser restarts.

## Method 1: GUI Settings (Recommended)

### General Settings

1. **Open Firefox Preferences**
   - Click hamburger menu (☰) → Settings
   - Or: `Ctrl+,` (Linux) / `Cmd+,` (Mac)

2. **Startup Configuration**
   - Go to: **General** → **Startup**
   - Set: **"When Firefox starts"** → **"Open previous windows and tabs"**
   - ✅ This ensures all tabs restore on startup

3. **History & Privacy**
   - Go to: **Privacy & Security** → **History**
   - Set: **"Firefox will:"** → **"Remember history"**
   - ✅ This prevents automatic cookie/session clearing

4. **Cookies and Site Data**
   - Go to: **Privacy & Security** → **Cookies and Site Data**
   - ✅ Ensure **"Accept cookies and site data"** is checked
   - ✅ **UNCHECK** "Delete cookies and site data when Firefox is closed"
   - Click **"Manage Exceptions"** → Add `web.whatsapp.com` → Set to **"Allow"**
   - Click **"Clear Data"** → **UNCHECK** "Cookies and Site Data" (so it's never cleared)

## Method 2: about:config (Advanced)

If GUI settings don't persist, use `about:config`:

1. **Open about:config**
   - Type `about:config` in address bar
   - Click "Accept the Risk and Continue"

2. **Set these preferences** (right-click → New → String/Boolean/Integer)

| Preference Name | Type | Value | Purpose |
|----------------|------|-------|---------|
| `browser.startup.page` | Integer | `3` | Restore previous session |
| `browser.sessionstore.resume_from_crash` | Boolean | `true` | Resume after crash |
| `browser.sessionstore.max_tabs_undo` | Integer | `50` | Keep many tabs in history |
| `browser.sessionstore.max_windows_undo` | Integer | `10` | Keep multiple windows |
| `privacy.clearOnShutdown.cookies` | Boolean | `false` | Don't clear cookies on exit |
| `privacy.clearOnShutdown.siteSettings` | Boolean | `false` | Don't clear site settings |
| `privacy.sanitize.sanitizeOnShutdown` | Boolean | `false` | Don't sanitize on shutdown |
| `browser.sessionstore.interval` | Integer | `15000` | Save session every 15 seconds |
| `browser.cache.disk.enable` | Boolean | `true` | Enable disk cache |
| `browser.cache.disk.capacity` | Integer | `1048576` | 1GB disk cache (1000000 KB) |
| `dom.storage.enabled` | Boolean | `true` | Enable localStorage |
| `dom.storage.persistent_site_data` | Boolean | `true` | Persist site data |

3. **WhatsApp-specific overrides**
   - Open: `about:config`
   - Search: `privacy.firstparty.isolate`
   - Set to: `false` (if exists, to prevent container isolation issues)
   - Search: `network.cookie.cookieBehavior`
   - Ensure it's: `0` (Accept all cookies) or `4` (Accept cookies but track in third-party)

## Verification

After setting preferences:

1. **Test session restore:**
   ```bash
   # Open Firefox with a few tabs
   firefox web.whatsapp.com &
   
   # Close Firefox completely
   pkill firefox
   
   # Reopen Firefox
   firefox &
   
   # Verify: tabs should be restored
   ```

2. **Check cookies are persisted:**
   - Open: `about:preferences#privacy`
   - Click: **"Cookies and Site Data"** → **"Manage Data"**
   - Search: `web.whatsapp.com`
   - ✅ Should show cookies present

3. **Verify profile location:**
   ```bash
   # Check profile directory exists
   ls -la ~/.mozilla/firefox/
   
   # Should see: profiles.ini and a directory like xxxxx.default-release
   ```

## Troubleshooting

### Tabs Not Restoring

1. Check `browser.startup.page` is `3` in `about:config`
2. Check `~/.mozilla/firefox/sessionstore.jsonlz4` exists and has recent timestamp
3. Verify no extension is clearing history (check Extensions → Multi-Account Containers → Options)

### Cookies Cleared on Exit

1. Verify `privacy.clearOnShutdown.cookies` is `false`
2. Check **Privacy & Security** → **Cookies and Site Data** → **"Delete cookies and site data when Firefox is closed"** is UNCHECKED
3. Check for conflicting privacy extensions

### Profile Location Issues

If Firefox creates a new profile on each start:

```bash
# List profiles
ls -la ~/.mozilla/firefox/

# Check profiles.ini
cat ~/.mozilla/firefox/profiles.ini

# Should show: IsRelative=1 and Default=1 for main profile
```

Fix: Ensure one profile is marked `Default=1` in `profiles.ini`

## Additional Stability Settings

These settings improve stability but are optional:

| Preference | Value | Purpose |
|-----------|-------|---------|
| `browser.sessionstore.max_serialize_back` | Integer | `20` | Keep more tabs in history |
| `browser.sessionstore.max_serialize_forward` | Integer | `0` | Disable forward history |
| `browser.sessionstore.restore_on_demand` | Boolean | `false` | Restore all tabs immediately |
| `media.autoplay.enabled` | Boolean | `false` | Prevent autoplay (reduces CPU) |
| `dom.disable_beforeunload` | Boolean | `true` | Disable "leave page" dialogs |

## Notes

- **Session files:** Firefox stores session data in `~/.mozilla/firefox/*/sessionstore.jsonlz4`
- **Cookies:** Stored in `~/.mozilla/firefox/*/cookies.sqlite`
- **Backup:** Always backup entire profile directory (see `backup_profile.sh`)
- **Container isolation:** Multi-Account Containers stores container data separately; cookies are isolated per container
