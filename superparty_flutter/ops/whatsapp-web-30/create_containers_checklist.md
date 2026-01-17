# Creating 30 WhatsApp Web Containers - Checklist

Step-by-step checklist to create containers WA-01 through WA-30 and open WhatsApp Web in each.

## Prerequisites

- ✅ Firefox installed (see `install_firefox_and_extension.md`)
- ✅ Multi-Account Containers extension installed and enabled
- ✅ Remote desktop access configured
- ✅ Firefox preferences configured for persistence (see `firefox_prefs.md`)

## Container Creation Process

### Quick Method (Recommended): Create All Containers First, Then Open Tabs

#### Step 1: Create All 30 Containers

1. **Open Firefox** (via remote desktop)

2. **Open Container Management**:
   - Click container icon in toolbar → **"Manage Containers"**
   - Or: `about:addons` → Multi-Account Containers → **Options** → **Containers** tab

3. **Create containers one by one** (WA-01 through WA-30):

   For each container (WA-01, WA-02, ..., WA-30):

   a. Click **"+"** or **"New Container"** button
   
   b. **Container name**: `WA-01` (then WA-02, WA-03, etc.)
   
   c. **Icon**: Choose a unique icon (recommend: different color for each group of 10)
      - WA-01 to WA-10: Blue icons (or sequential: Fingerprint, Briefcase, Dollar, Cart, etc.)
      - WA-11 to WA-20: Green icons
      - WA-21 to WA-30: Orange icons
   
   d. **Color**: Assign a unique color (or use default)
      - Recommended: Use color picker to create gradients (e.g., blue shades for 01-10, green for 11-20, etc.)
   
   e. Click **"Save"**

4. **Verify all containers created**:
   - Container list should show: WA-01, WA-02, ..., WA-30
   - Total: 30 containers

**Estimated time:** 5-10 minutes (create all containers in one session)

#### Step 2: Open WhatsApp Web in Each Container

**Important:** Do this one container at a time to avoid mixing sessions.

For each container (WA-01, WA-02, ..., WA-30):

1. **Right-click Firefox toolbar** → **"New Tab"**
   - Or: Press `Ctrl+T`

2. **Click container icon** in new tab's address bar
   - Should show list of containers

3. **Select container** (e.g., WA-01)
   - Tab will show container badge/icon

4. **Navigate to WhatsApp Web**:
   - Type: `web.whatsapp.com`
   - Or: Click container icon → **"Always open this site in..."** → Select container → Visit site

5. **Pin the tab** (to prevent accidental closure):
   - Right-click tab → **"Pin Tab"**
   - Tab will move to left and show pin icon

6. **Wait for page load** → Should show QR code scanner

7. **Repeat for next container** (WA-02, then WA-03, etc.)

**Estimated time:** 10-15 minutes (open all tabs, one by one)

#### Step 3: Login to WhatsApp Web (Per Account)

**Important:** Each WhatsApp account requires manual QR code scan. Do this after all tabs are open.

For each container (WA-01 through WA-30):

1. **Identify the phone number** assigned to this container (keep a mapping document)

2. **Find the tab** for that container (look for container icon/badge)

3. **If tab shows QR code**:
   - Open WhatsApp on the corresponding phone
   - Go to: **Settings** → **Linked Devices** → **"Link a Device"**
   - Scan QR code shown in Firefox tab
   - Wait for green checkmark ✅ (means logged in)

4. **If tab is already logged in** (green checkmark visible):
   - Skip to next container

5. **Verify login**:
   - Tab should show WhatsApp interface (chat list, no QR code)
   - Address bar shows container icon/badge

**Estimated time:** 2-3 minutes per account = 60-90 minutes total (if logging in all 30)

#### Step 4: Verify All Tabs Are Open and Pinned

1. **Count tabs**:
   - Should see 30 pinned tabs (with pin icon) at left of tab bar

2. **Verify container assignment**:
   - Hover over each tab → should show container name in tooltip
   - Or click tab → address bar shows container icon

3. **Verify WhatsApp Web URLs**:
   - All tabs should show: `web.whatsapp.com` in address bar

## Detailed Checklist (Copy-Paste Format)

Use this checklist to track progress:

```
Container Creation:
[ ] WA-01 created (icon: ______, color: ______)
[ ] WA-02 created (icon: ______, color: ______)
[ ] WA-03 created (icon: ______, color: ______)
...
[ ] WA-30 created (icon: ______, color: ______)

Tab Creation:
[ ] WA-01 tab opened and pinned (URL: web.whatsapp.com)
[ ] WA-02 tab opened and pinned (URL: web.whatsapp.com)
[ ] WA-03 tab opened and pinned (URL: web.whatsapp.com)
...
[ ] WA-30 tab opened and pinned (URL: web.whatsapp.com)

Login Status:
[ ] WA-01 logged in (phone: __________)
[ ] WA-02 logged in (phone: __________)
[ ] WA-03 logged in (phone: __________)
...
[ ] WA-30 logged in (phone: __________)
```

## Tips for Efficiency

### Tip 1: Batch Container Creation

Create containers in groups of 10:
- Create WA-01 to WA-10 first (use blue icons)
- Create WA-11 to WA-20 next (use green icons)
- Create WA-21 to WA-30 last (use orange icons)

### Tip 2: Use Keyboard Shortcuts

- **New Tab**: `Ctrl+T`
- **Close Tab**: `Ctrl+W` (be careful not to close pinned tabs)
- **Switch Tabs**: `Ctrl+Tab` or `Ctrl+PageUp/PageDown`
- **Pin Tab**: `Ctrl+Shift+P` (after right-click → Pin Tab, or use context menu)

### Tip 3: Organize Tabs

If 30 tabs are too many in one window:

1. **Create multiple windows**:
   - File → New Window
   - Drag 10 tabs to new window
   - Repeat (3 windows × 10 tabs each)

2. **Use tab groups** (Firefox 89+):
   - Right-click tab → **"Move to New Group"**
   - Assign names: "Group 1 (WA-01-10)", "Group 2 (WA-11-20)", etc.

### Tip 4: Document Container-to-Phone Mapping

Create a text file: `/home/wa/container-mapping.txt`

```
WA-01 → +1234567890
WA-02 → +1234567891
WA-03 → +1234567892
...
WA-30 → +1234567899
```

This helps when re-logging after logout.

## Troubleshooting

### Container Not Showing in List

- Verify extension is enabled: `about:addons` → Extensions → Multi-Account Containers
- Refresh container list: Close and reopen "Manage Containers"
- Restart Firefox if needed

### Tab Opened in Wrong Container

1. **Close the tab** (carefully, if it's the only one in that container)
2. **Create new tab** in correct container
3. Navigate to `web.whatsapp.com` again

### Container Icon Not Showing in Tab

- Verify container is selected: Click tab → address bar should show container badge
- If missing, right-click page → **"Open in New Container Tab"** → Select correct container

### WhatsApp Web Not Loading in Container

1. **Check if site is assigned to container**:
   - Container icon → **"Always open this site in..."** → Should show assigned container
   - If not, assign: `web.whatsapp.com` → Select container

2. **Clear site data for that container** (if needed):
   - `about:preferences#privacy` → **"Cookies and Site Data"** → **"Manage Data"**
   - Search: `web.whatsapp.com` → Delete (only if needed)

### Tab Closed Accidentally

1. **Restore from history**:
   - `Ctrl+Shift+T` (undo close tab)
   - Or: History → Recently Closed Tabs

2. **Re-open manually**:
   - Create new tab in correct container
   - Navigate to `web.whatsapp.com`
   - Re-login if session was lost

## Verification

After completing all steps:

1. **Count containers**: `about:addons` → Multi-Account Containers → Options → Containers tab → Should show 30

2. **Count tabs**: Firefox tab bar → Should show 30 pinned tabs

3. **Verify persistence**: Close Firefox completely → Reopen → All tabs should restore

4. **Check login status**: Open each tab → Should show WhatsApp interface (or QR if logged out)

## Next Steps

After containers and tabs are created:

1. **Set up auto-start** (see `systemd_autostart.md`)
2. **Enable backups** (see `backup_profile.sh`)
3. **Test reboot** (restart server → verify tabs restore)

## Notes

- **Container isolation**: Each container has separate cookies/localStorage. WhatsApp sessions are isolated per container.
- **Container naming**: Use exact names (WA-01, WA-02, etc.) for consistency with scripts/documentation.
- **Icon/color choice**: Use different icons/colors to visually distinguish containers (helps when managing 30 tabs).
- **Pinning tabs**: Pinned tabs reduce risk of accidental closure but still restore on Firefox restart if unpinned.
