# WhatsApp Web 30-Session Setup for macOS

Long-term stable setup for 30 WhatsApp Web accounts using Firefox Multi-Account Containers, split across two Firefox profiles for resilience.

## Architecture

```
macOS System
├── Firefox Profile A: ~/Library/Application Support/Firefox/Profiles/wa-profile-a/
│   └── Containers: WA-01, WA-02, ..., WA-15 (15 sessions)
├── Firefox Profile B: ~/Library/Application Support/Firefox/Profiles/wa-profile-b/
│   └── Containers: WA-16, WA-17, ..., WA-30 (15 sessions)
└── Scripts: Launch profiles, status checks, notifications
```

## Overview

This setup provides:
- **Two Firefox profiles** (Profile A: WA-01..WA-15, Profile B: WA-16..WA-30)
- **Multi-Account Containers** extension (30 isolated containers total)
- **Session persistence** across reboots
- **Simple launch scripts** for both profiles
- **Status monitoring** (best-effort checks for logged-out sessions)
- **Manual QR relink** when WhatsApp requires it

## Prerequisites

- macOS 10.15+ (tested on macOS 15.6 Sequoia)
- Admin access (for Firefox installation)
- Internet connection
- 30 WhatsApp phone numbers (one per container)
- Minimum 8GB RAM (16GB+ recommended)

## Quick Start

1. **Install Firefox** (see "Install Firefox" section)
2. **Create Profiles A and B** (see "Create Firefox Profiles" section)
3. **Install Multi-Account Containers extension** in both profiles
4. **Create containers** (WA-01..WA-15 in Profile A, WA-16..WA-30 in Profile B)
5. **Open WhatsApp Web** in each container and login
6. **Pin all tabs** and configure session restore
7. **Use launch scripts** to start both profiles

## Part 1: Install Firefox

### Method A: Homebrew (Recommended)

```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Firefox
brew install --cask firefox
```

### Method B: Direct Download

1. Visit: https://www.mozilla.org/firefox/mac/
2. Download Firefox for macOS
3. Open `.dmg` file and drag Firefox to Applications folder

### Verify Installation

```bash
# Check Firefox version
/Applications/Firefox.app/Contents/MacOS/firefox --version

# Expected output: Mozilla Firefox XX.X.X
```

## Part 2: Create Firefox Profiles

Firefox stores profiles in: `~/Library/Application Support/Firefox/Profiles/`

### Create Profile A

1. **Open Firefox Profile Manager**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -ProfileManager
   ```
   Or: Close all Firefox windows → Hold `Option` key while opening Firefox → Click "Create Profile"

2. **Create new profile**:
   - Click **"Create Profile"**
   - Profile name: `wa-profile-a`
   - Profile folder: Use default location (`~/Library/Application Support/Firefox/Profiles/wa-profile-a`)
   - Click **"Finish"**
   - **Do NOT start Firefox yet** (close Profile Manager)

3. **Verify profile created**:
   ```bash
   ls -la ~/Library/Application\ Support/Firefox/Profiles/ | grep wa-profile-a
   # Should show: wa-profile-a.default-release (or similar)
   ```

### Create Profile B

1. **Open Firefox Profile Manager again**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -ProfileManager
   ```

2. **Create second profile**:
   - Click **"Create Profile"**
   - Profile name: `wa-profile-b`
   - Profile folder: Use default location (`~/Library/Application Support/Firefox/Profiles/wa-profile-b`)
   - Click **"Finish"**
   - Close Profile Manager

3. **Verify profile created**:
   ```bash
   ls -la ~/Library/Application\ Support/Firefox/Profiles/ | grep wa-profile-b
   # Should show: wa-profile-b.default-release (or similar)
   ```

### Note on Profile Location

Firefox may create profiles with suffixes like `.default-release`. The actual profile directory will be something like:
- `wa-profile-a.default-release`
- `wa-profile-b.default-release`

The scripts use `-P` flag to launch by profile name, which handles this automatically.

## Part 3: Launch Profiles (Before Configuration)

Before installing extensions, test launching each profile:

### Launch Profile A

```bash
/Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance &
```

### Launch Profile B

```bash
/Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-b -new-instance &
```

**Important:** Use `-new-instance` flag so both profiles can run simultaneously.

### Stop Both Profiles

```bash
# Stop all Firefox instances
pkill firefox

# Or stop specific profile (if you can identify the process)
```

## Part 4: Install Multi-Account Containers Extension

Install the extension in **both profiles** separately.

### Install in Profile A

1. **Launch Profile A**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance &
   ```

2. **Open Add-ons Manager**:
   - Menu: `Firefox` → `Add-ons and Themes`
   - Or: `Cmd+Shift+A`
   - Or: Type `about:addons` in address bar

3. **Install Multi-Account Containers**:
   - Click **"Extensions"** in left sidebar
   - Search: **"Multi-Account Containers"** (by Mozilla)
   - Click **"Add to Firefox"**
   - Click **"Add"** in confirmation dialog

4. **Verify installation**:
   - Look for container icon in Firefox toolbar
   - Click icon → Should show "New Container" option

5. **Close Profile A** (but keep extension installed)

### Install in Profile B

1. **Launch Profile B**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-b -new-instance &
   ```

2. **Repeat steps 2-4 from Profile A** (install Multi-Account Containers extension)

3. **Close Profile B**

## Part 5: Configure Firefox for Session Persistence

Configure both profiles for session restore.

### Configure Profile A

1. **Launch Profile A**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance &
   ```

2. **Open Preferences**:
   - Menu: `Firefox` → `Settings` (or `Preferences`)
   - Or: `Cmd+,`

3. **Configure Startup**:
   - Tab: **"General"**
   - Section: **"Startup"**
   - Set: **"When Firefox starts"** → **"Open previous windows and tabs"**

4. **Configure Privacy**:
   - Tab: **"Privacy & Security"**
   - Section: **"History"**
   - Set: **"Firefox will:"** → **"Remember history"**

5. **Configure Cookies**:
   - Section: **"Cookies and Site Data"**
   - ✅ Ensure **"Accept cookies and site data"** is checked
   - ✅ **UNCHECK** "Delete cookies and site data when Firefox is closed"
   - Click **"Manage Exceptions"** → Add `web.whatsapp.com` → Set to **"Allow"**

6. **Close Profile A**

### Configure Profile B

1. **Launch Profile B**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-b -new-instance &
   ```

2. **Repeat steps 2-5 from Profile A** (same settings)

3. **Close Profile B**

### Advanced: about:config (Optional)

If GUI settings don't persist, use `about:config`:

1. Type `about:config` in address bar → Accept risk
2. Set these preferences:
   - `browser.startup.page` → `3` (restore previous session)
   - `browser.sessionstore.resume_from_crash` → `true`
   - `privacy.clearOnShutdown.cookies` → `false`
   - `privacy.sanitize.sanitizeOnShutdown` → `false`

Do this in both profiles separately.

## Part 6: Create Containers

### Profile A: Create Containers WA-01 through WA-15

1. **Launch Profile A**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance &
   ```

2. **Open Container Management**:
   - Click container icon in toolbar → **"Manage Containers"**
   - Or: `about:addons` → Multi-Account Containers → **"Options"** → **"Containers"** tab

3. **Create 15 containers** (one by one):

   For each container (WA-01, WA-02, ..., WA-15):

   a. Click **"+"** or **"New Container"** button
   
   b. **Container name**: `WA-01` (then WA-02, WA-03, etc. up to WA-15)
   
   c. **Icon**: Choose a distinct icon (recommend: sequential icons for visual tracking)
      - WA-01 to WA-05: Blue icons
      - WA-06 to WA-10: Green icons
      - WA-11 to WA-15: Orange icons
   
   d. **Color**: Assign unique color (or use default)
   
   e. Click **"Save"**

4. **Verify all 15 containers created**:
   - Container list should show: WA-01, WA-02, ..., WA-15
   - Total: 15 containers

5. **Close Profile A** (keep containers; they're saved in profile)

### Profile B: Create Containers WA-16 through WA-30

1. **Launch Profile B**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-b -new-instance &
   ```

2. **Repeat steps 2-3 from Profile A**, but create:
   - WA-16, WA-17, ..., WA-30 (15 containers)
   - Use different icons/colors than Profile A for easy visual distinction

3. **Verify all 15 containers created**

4. **Close Profile B**

## Part 7: Open WhatsApp Web in Each Container

This is done manually per container. Each container must be opened in a new tab and assigned to the container.

### Profile A: Open WhatsApp Web in WA-01..WA-15

1. **Launch Profile A**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance &
   ```

2. **For each container (WA-01, WA-02, ..., WA-15)**:

   **Step 2a: Create New Tab**
   - Press `Cmd+T` (or right-click tab bar → "New Tab")
   
   **Step 2b: Assign Tab to Container**
   - Click **container icon** in new tab's address bar
   - Select container: `WA-01` (then WA-02, etc.)
   - Tab will show container badge/icon in address bar
   
   **Step 2c: Navigate to WhatsApp Web**
   - Type: `web.whatsapp.com` in address bar
   - Press Enter
   - Wait for page to load (shows QR code scanner)
   
   **Step 2d: Pin Tab**
   - Right-click tab → **"Pin Tab"**
   - Tab will move to left and show pin icon
   
   **Step 2e: Verify Container Assignment**
   - Address bar should show container icon/badge
   - Hover over tab → tooltip shows container name (e.g., "WA-01")

3. **Repeat for all 15 containers** (WA-01 through WA-15)

4. **Verify all tabs are pinned**:
   - Should see 15 pinned tabs at left of tab bar
   - All tabs should show `web.whatsapp.com`

5. **Close Profile A** (Firefox will save session)

### Profile B: Open WhatsApp Web in WA-16..WA-30

1. **Launch Profile B**:
   ```bash
   /Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-b -new-instance &
   ```

2. **Repeat steps 2-5 from Profile A**, but use:
   - Containers: WA-16, WA-17, ..., WA-30
   - Result: 15 pinned tabs in Profile B

3. **Close Profile B**

## Part 8: Login to WhatsApp Web (Per Account)

**Important:** Each WhatsApp account requires manual QR code scan. Do this after all tabs are open.

### For Each Container (WA-01 through WA-30)

1. **Identify phone number** assigned to this container (keep a mapping document)

2. **Launch the appropriate profile**:
   - WA-01..WA-15: Launch Profile A
   - WA-16..WA-30: Launch Profile B

3. **Find the container tab**:
   - Look for pinned tab with container icon (e.g., WA-01)
   - Click on the tab

4. **If tab shows QR code**:
   - Open WhatsApp on the corresponding phone
   - Go to: **Settings** → **Linked Devices** → **"Link a Device"**
   - Scan QR code shown in Firefox tab
   - Wait for green checkmark ✅ (means logged in)

5. **If tab is already logged in** (green checkmark visible):
   - Skip to next container

6. **Verify login**:
   - Tab should show WhatsApp interface (chat list, no QR code)
   - Address bar shows container icon/badge

**Estimated time:** 2-3 minutes per account = 60-90 minutes total for all 30

## Part 9: Install Launch Scripts

The scripts automate launching both profiles.

1. **Copy scripts to a convenient location**:
   ```bash
   cd /path/to/ops/whatsapp_web_firefox_mac_split/
   chmod +x scripts/*.sh
   ```

2. **Test scripts**:
   ```bash
   # Launch Profile A only
   ./scripts/launch_profile_a.sh

   # Launch Profile B only
   ./scripts/launch_profile_b.sh

   # Launch both profiles
   ./scripts/launch_all.sh
   ```

3. **Verify both profiles open**:
   - Two Firefox windows should appear
   - Profile A: 15 pinned tabs (WA-01..WA-15)
   - Profile B: 15 pinned tabs (WA-16..WA-30)

## Part 10: Configure macOS for Stability

### Prevent Sleep During Use

If machine sleeps, Firefox may lose connections. Prevent sleep while using WhatsApp Web:

```bash
# Prevent sleep (disable when done)
caffeinate -d &

# To cancel: pkill caffeinate
```

Or use System Preferences:
- **System Settings** → **Battery** → **Options** → **"Prevent automatic sleeping on power adapter when the display is off"**

### Network Stability

- **Use stable network** (WiFi or Ethernet)
- **Avoid VPN changes** while Firefox is running (WhatsApp may log out sessions)
- **Keep IP address stable** (don't switch networks frequently)

### Firewall/Security

- **Allow Firefox** through macOS Firewall:
  - **System Settings** → **Network** → **Firewall** → **Options**
  - Ensure Firefox is allowed (or temporarily disable firewall for testing)

### Startup Items (Optional)

To auto-launch both profiles on login:

1. **Create Launch Agent** (see "Automation" section below) OR
2. **Add scripts to Login Items**:
   - **System Settings** → **General** → **Login Items**
   - Click **"+"** → Add `launch_all.sh` script

## Part 11: Status Monitoring (Best-Effort)

The status check scripts attempt to detect logged-out sessions. However, **this is best-effort** due to WhatsApp Web's dynamic content.

### Manual Status Check

1. **Launch both profiles**:
   ```bash
   ./scripts/launch_all.sh
   ```

2. **Visual scan**:
   - Open each profile window
   - Scan tabs for "Please scan QR code" messages
   - Note which containers need relink

3. **Use status check scripts** (if available):
   ```bash
   ./scripts/status_check_a.sh  # Check Profile A containers
   ./scripts/status_check_b.sh  # Check Profile B containers
   ```

**Limitation:** Automated status checks may not be 100% reliable due to WhatsApp Web's dynamic content. Manual visual check is always recommended.

### Notification Helper

If a container needs relink, use notification helper:

```bash
./scripts/notify.sh "WA-05 needs QR re-scan"
```

This sends a macOS notification (useful for scheduled checks).

## Part 12: Reboot Workflow

After macOS reboot or restart:

1. **Launch both profiles**:
   ```bash
   cd /path/to/ops/whatsapp_web_firefox_mac_split/
   ./scripts/launch_all.sh
   ```

2. **Wait for tabs to restore** (Firefox should restore all pinned tabs automatically)

3. **Verify sessions**:
   - Profile A: 15 tabs should restore
   - Profile B: 15 tabs should restore
   - Some sessions may require QR re-scan (normal if WhatsApp invalidated them)

4. **Re-link any logged-out sessions**:
   - Click tab showing "Please scan QR code"
   - Scan QR from corresponding phone
   - Done

**Expected behavior after reboot:**
- Most sessions (25-28 out of 30) should remain logged in
- 0-5 sessions may require QR re-scan (WhatsApp's security validation)

## Troubleshooting

### Firefox Won't Start

```bash
# Check if already running
ps aux | grep firefox

# Kill if needed
pkill firefox

# Try launching profile manually
/Applications/Firefox.app/Contents/MacOS/firefox -P wa-profile-a -new-instance
```

### Tabs Not Restoring

1. **Check Firefox preferences** (in each profile):
   - General → Startup → "Open previous windows and tabs"

2. **Check profile directory**:
   ```bash
   ls -la ~/Library/Application\ Support/Firefox/Profiles/wa-profile-a*/
   # Should show: sessionstore.jsonlz4 with recent timestamp
   ```

3. **Manually restore** (if needed):
   - History → Recently Closed Windows → Restore

### Session Logged Out (QR Required)

**This is normal.** WhatsApp may log out sessions for:
- Long inactivity (30+ days)
- Security reasons
- IP address changes

**Fix:** Click tab → scan QR code again. No automation needed.

### Container Tabs Mixed Up

1. **Verify container assignment**:
   - Click tab → address bar shows container icon
   - Hover over container icon → shows container name

2. **Fix wrong container**:
   - Close tab (carefully)
   - Create new tab → Select correct container
   - Navigate to `web.whatsapp.com`
   - Re-login if needed

### Both Profiles Won't Launch Simultaneously

Ensure you're using `-new-instance` flag:

```bash
# Correct (both can run at once)
firefox -P wa-profile-a -new-instance &
firefox -P wa-profile-b -new-instance &

# Incorrect (second won't start)
firefox -P wa-profile-a &
firefox -P wa-profile-b &
```

### Profile Name Not Found

If profile name doesn't work, use full path:

```bash
# Find profile directory
ls -la ~/Library/Application\ Support/Firefox/Profiles/

# Launch with full path (example)
firefox -profile ~/Library/Application\ Support/Firefox/Profiles/wa-profile-a.default-release -new-instance &
```

## Validation Checklist

Before considering setup complete:

- [ ] Firefox installed and verified (`firefox --version`)
- [ ] Profile A created (`wa-profile-a`)
- [ ] Profile B created (`wa-profile-b`)
- [ ] Multi-Account Containers extension installed in Profile A
- [ ] Multi-Account Containers extension installed in Profile B
- [ ] Profile A: 15 containers created (WA-01..WA-15)
- [ ] Profile B: 15 containers created (WA-16..WA-30)
- [ ] Profile A: 15 pinned tabs with WhatsApp Web
- [ ] Profile B: 15 pinned tabs with WhatsApp Web
- [ ] At least one account logged in in Profile A (green checkmark)
- [ ] At least one account logged in in Profile B (green checkmark)
- [ ] Launch scripts work (`./scripts/launch_all.sh` opens both profiles)
- [ ] After restart: Tabs restore in both profiles (test by closing and reopening)
- [ ] After macOS reboot: Tabs restore (some may require QR re-scan - normal)

## File Locations

- **Firefox profiles**: `~/Library/Application Support/Firefox/Profiles/`
  - Profile A: `wa-profile-a.default-release/` (or similar)
  - Profile B: `wa-profile-b.default-release/` (or similar)
- **Scripts**: `ops/whatsapp_web_firefox_mac_split/scripts/`
- **Config files**: `ops/whatsapp_web_firefox_mac_split/config/`

## Recovery Procedures

### Complete Profile Corruption

If a profile is completely broken:

1. **Stop Firefox**:
   ```bash
   pkill firefox
   ```

2. **Backup current profile** (in case you need something from it):
   ```bash
   mv ~/Library/Application\ Support/Firefox/Profiles/wa-profile-a.default-release ~/Library/Application\ Support/Firefox/Profiles/wa-profile-a.default-release.broken
   ```

3. **Recreate profile** (follow "Create Firefox Profiles" section)

4. **Reinstall extension and recreate containers** (follow setup steps again)

5. **Re-login all sessions** (scan QR codes again)

### Container Data Loss

If one container's cookies are lost:

1. **Re-open WhatsApp Web** in that container
2. **Scan QR code** again
3. **Done**

### Adding New Account

If you need more than 30 accounts:

1. **Create new container** in appropriate profile (A or B)
2. **Open WhatsApp Web** in new container
3. **Scan QR code**
4. **Pin tab**

## Security & Privacy

- **No credential storage**: This setup does not store phone numbers or credentials
- **No automation**: All QR scans are manual (by design)
- **Isolated containers**: Each container has separate cookies/localStorage
- **Profile isolation**: Profiles are completely separate (no data sharing)

## Notes

- **macOS Sleep**: If machine sleeps for extended periods, WhatsApp may log out sessions
- **Network changes**: Changing network/IP may trigger WhatsApp logouts
- **Session timeouts**: WhatsApp may log out sessions after 30+ days of inactivity (normal)
- **Profile naming**: Firefox may append `.default-release` to profile names; scripts handle this

## Support

- **Firefox profiles**: https://support.mozilla.org/en-US/kb/profiles-where-firefox-stores-user-data
- **Multi-Account Containers**: https://addons.mozilla.org/firefox/addon/multi-account-containers/
- **macOS Launch Agents**: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
