# Installing Firefox and Multi-Account Containers Extension

Step-by-step guide to install Firefox and the Multi-Account Containers extension.

## Prerequisites

- Run as user `wa`: `su - wa`
- Remote desktop access configured (see `setup_remote_desktop.sh`)

## Part 1: Install Firefox

### Option A: Install from Mozilla Repository (Recommended)

```bash
# As root (or with sudo)
sudo apt-get update
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:mozillateam/ppa

# Configure priority to prefer Mozilla's Firefox
sudo bash <<EOF
cat > /etc/apt/preferences.d/mozilla-firefox <<PREF
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001
PREF
EOF

# Install Firefox
sudo apt-get update
sudo apt-get install -y firefox
```

### Option B: Install from Ubuntu Repository (Simpler)

```bash
sudo apt-get update
sudo apt-get install -y firefox
```

### Option C: Download Firefox Binary (Manual)

If apt repository doesn't work:

```bash
# As user wa
cd /tmp
wget https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US -O firefox.tar.bz2

# Extract
tar -xjf firefox.tar.bz2

# Move to /opt (requires sudo)
sudo mv firefox /opt/firefox

# Create symlink (optional, for command-line access)
sudo ln -s /opt/firefox/firefox /usr/local/bin/firefox

# Cleanup
rm firefox.tar.bz2
```

### Verify Installation

```bash
# Check Firefox version
firefox --version

# Expected output: Mozilla Firefox XX.X.X
```

## Part 2: Configure Firefox for First Run

### Initial Setup

1. **Access remote desktop** (web browser or VNC client)
2. **Launch Firefox**:
   ```bash
   firefox &
   ```

3. **Complete Firefox first-run wizard** (if any):
   - Choose default search engine
   - Skip sync setup (optional)
   - Don't import bookmarks (we'll configure manually)

4. **Verify Firefox profile created**:
   ```bash
   ls -la ~/.mozilla/firefox/
   # Should see: profiles.ini and a directory like xxxxx.default-release
   ```

## Part 3: Install Multi-Account Containers Extension

### Method 1: Install from Firefox Add-ons Store (Recommended)

1. **Open Firefox** (via remote desktop)

2. **Open Add-ons Manager**:
   - Click hamburger menu (☰) → **Add-ons and Themes**
   - Or: Press `Ctrl+Shift+A`
   - Or: Type `about:addons` in address bar

3. **Search for extension**:
   - Click **Extensions** in left sidebar
   - Click **"Find more add-ons"** (link at bottom) or use search box
   - Search: **"Multi-Account Containers"**
   - Author should be: **Mozilla** or **Firefox Test Pilot**

4. **Install extension**:
   - Click **"Add to Firefox"**
   - Click **"Add"** in confirmation dialog
   - Extension should appear in Extensions list

5. **Verify installation**:
   - Look for **"Multi-Account Containers"** icon in Firefox toolbar (container icon)
   - Click it → Should show "New Container" option

### Method 2: Install from Mozilla Add-ons Website

If in-app search doesn't work:

1. **Open Firefox** (via remote desktop)

2. **Navigate to**:
   ```
   https://addons.mozilla.org/en-US/firefox/addon/multi-account-containers/
   ```

3. **Click "Add to Firefox"** button

4. **Confirm installation** in popup

5. **Verify** as in Method 1

### Method 3: Manual Installation (If store is blocked)

If you cannot access addons.mozilla.org:

1. **Download extension file**:
   ```bash
   # As user wa
   cd /tmp
   wget https://addons.mozilla.org/firefox/downloads/file/XXXXX/multi_account_containers-XXXXX.xpi
   # Replace XXXXX with actual version numbers (check latest version on website)
   ```

2. **Install via Firefox**:
   - Open Firefox
   - Go to: `about:addons`
   - Click gear icon (⚙️) → **"Install Add-on From File..."**
   - Select downloaded `.xpi` file
   - Confirm installation

### Verify Extension is Working

1. **Check extension is enabled**:
   - `about:addons` → Extensions → Multi-Account Containers → Should be **Enabled**

2. **Test container creation**:
   - Click container icon in toolbar (or right-click page → **"Open in New Container Tab"**)
   - Should show option to create new container
   - If not, extension may need restart

3. **Restart Firefox if needed**:
   ```bash
   pkill firefox
   firefox &
   ```

## Part 4: Configure Extension Settings

1. **Open Multi-Account Containers settings**:
   - Click container icon in toolbar → **"Manage Containers"**
   - Or: `about:addons` → Multi-Account Containers → **Options**

2. **Configure behavior**:
   - ✅ Enable **"Always open this site in..."** for WhatsApp Web (we'll set per container)
   - ✅ Enable **"Always ask"** if you want to confirm container selection

3. **Verify container isolation**:
   - Create a test container (e.g., "Test-1")
   - Open `web.whatsapp.com` in test container
   - Check address bar shows container icon/badge
   - Open `web.whatsapp.com` in default/no container
   - Should be separate (cookies isolated)

## Troubleshooting

### Firefox Won't Start

```bash
# Check if display is set
echo $DISPLAY
# Should show: :0 or :1

# If empty, set display
export DISPLAY=:0
firefox &
```

### Extension Not Installing

1. **Check Firefox version**:
   ```bash
   firefox --version
   # Should be Firefox 88+ for Multi-Account Containers
   ```

2. **Check if extensions are blocked**:
   - Go to: `about:config`
   - Search: `xpinstall.signatures.required`
   - Set to: `false` (if you need to install unsigned extensions - not recommended)

3. **Check addons.mozilla.org access**:
   ```bash
   curl -I https://addons.mozilla.org
   # Should return HTTP 200
   ```

### Extension Not Working

1. **Check if extension is enabled**:
   - `about:addons` → Extensions → Multi-Account Containers → Toggle **Enabled**

2. **Check for conflicts**:
   - Disable other privacy extensions temporarily
   - Restart Firefox

3. **Reset extension**:
   - `about:addons` → Multi-Account Containers → **Remove**
   - Reinstall from store

### Container Icon Not Showing

1. **Customize toolbar**:
   - Right-click toolbar → **"Customize Toolbar"**
   - Drag **"Multi-Account Containers"** icon to toolbar
   - Click **"Done"**

2. **Check if extension is active**:
   - `about:addons` → Check if extension shows errors

## Next Steps

After Firefox and extension are installed:

1. **Configure Firefox preferences** (see `firefox_prefs.md`)
2. **Create 30 containers** (see `create_containers_checklist.md`)
3. **Set up auto-start** (see `systemd_autostart.md`)

## References

- Firefox installation: https://www.mozilla.org/firefox/
- Multi-Account Containers: https://addons.mozilla.org/firefox/addon/multi-account-containers/
- Firefox profiles: https://support.mozilla.org/en-US/kb/profiles-where-firefox-stores-user-data
