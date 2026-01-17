# Systemd Auto-Start Configuration

This guide sets up Firefox to automatically start on system boot and restore all 30 WhatsApp Web tabs.

## Overview

We'll create a systemd user service that:
- Starts Firefox automatically after user login
- Waits for display/X server to be ready
- Restores previous session (all 30 tabs)
- Restarts Firefox if it crashes

## Prerequisites

- ✅ User `wa` exists (from `setup_server.sh`)
- ✅ Firefox installed (from `install_firefox_and_extension.md`)
- ✅ Systemd lingering enabled (done in `setup_remote_desktop.sh`)

## Step 1: Create Systemd Service File

1. **Switch to user `wa`**:
   ```bash
   su - wa
   ```

2. **Create systemd user directory** (if not exists):
   ```bash
   mkdir -p ~/.config/systemd/user
   ```

3. **Create service file**:
   ```bash
   nano ~/.config/systemd/user/wa-firefox.service
   ```

4. **Paste the following content** (see `wa-firefox.service` file for exact content):

```ini
[Unit]
Description=Firefox with WhatsApp Web containers
After=graphical-session.target
Wants=graphical-session.target

[Service]
Type=simple
Environment="DISPLAY=:0"
Environment="HOME=/home/wa"
ExecStart=/usr/bin/firefox
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

5. **Save and exit**: `Ctrl+O`, `Enter`, `Ctrl+X`

## Step 2: Enable and Start Service

1. **Reload systemd**:
   ```bash
   systemctl --user daemon-reload
   ```

2. **Enable service** (starts on boot):
   ```bash
   systemctl --user enable wa-firefox.service
   ```

3. **Start service** (starts immediately):
   ```bash
   systemctl --user start wa-firefox.service
   ```

4. **Verify service is running**:
   ```bash
   systemctl --user status wa-firefox.service
   ```

   Should show:
   ```
   ● wa-firefox.service - Firefox with WhatsApp Web containers
        Loaded: loaded (/home/wa/.config/systemd/user/wa-firefox.service; enabled)
        Active: active (running) since ...
   ```

5. **Check Firefox process**:
   ```bash
   ps aux | grep firefox
   # Should show firefox process running
   ```

## Step 3: Configure Auto-Login (Optional)

For Firefox to start on boot, user `wa` must be logged in to X session. Options:

### Option A: Auto-Login via LightDM (Recommended)

1. **Install lightdm** (if not installed):
   ```bash
   sudo apt-get install -y lightdm
   ```

2. **Configure auto-login**:
   ```bash
   sudo nano /etc/lightdm/lightdm.conf
   ```

   Find `[Seat:*]` section and add:
   ```ini
   [Seat:*]
   autologin-user=wa
   autologin-user-timeout=0
   ```

3. **Set display manager**:
   ```bash
   sudo systemctl set-default graphical.target
   sudo systemctl enable lightdm
   ```

4. **Reboot to test**:
   ```bash
   sudo reboot
   ```

### Option B: Auto-Start X Server (Alternative)

If you prefer to start X server manually:

1. **Create X session script**:
   ```bash
   nano ~/.xinitrc
   ```

   Add:
   ```bash
   #!/bin/bash
   exec startxfce4
   ```

2. **Make executable**:
   ```bash
   chmod +x ~/.xinitrc
   ```

3. **Start X server**:
   ```bash
   startx
   ```

   (This is manual; not auto-start)

## Step 4: Verify Auto-Start

1. **Reboot server**:
   ```bash
   sudo reboot
   ```

2. **Wait 2-3 minutes** for services to start

3. **Check service status**:
   ```bash
   su - wa
   systemctl --user status wa-firefox.service
   ```

4. **Check Firefox**:
   - Access remote desktop
   - Firefox should be open with all 30 tabs restored

## Troubleshooting

### Service Won't Start

1. **Check service logs**:
   ```bash
   journalctl --user -u wa-firefox.service -n 50
   ```

2. **Check display**:
   ```bash
   echo $DISPLAY
   # Should show: :0
   ```

3. **Verify Firefox path**:
   ```bash
   which firefox
   # Should show: /usr/bin/firefox (or /opt/firefox/firefox)
   ```

### Firefox Starts But Tabs Don't Restore

1. **Check Firefox preferences**:
   - Ensure "Open previous windows and tabs" is set (see `firefox_prefs.md`)

2. **Check profile location**:
   ```bash
   ls -la ~/.mozilla/firefox/
   # Should show sessionstore.jsonlz4 with recent timestamp
   ```

3. **Manually restore session**:
   - History → Recently Closed Windows → Restore (if needed)

### Service Starts Too Early (Before Display)

If Firefox starts before X server is ready:

1. **Add delay** in service file:
   ```bash
   nano ~/.config/systemd/user/wa-firefox.service
   ```

   Add before `ExecStart`:
   ```ini
   ExecStartPre=/bin/sleep 10
   ```

2. **Reload and restart**:
   ```bash
   systemctl --user daemon-reload
   systemctl --user restart wa-firefox.service
   ```

### Multiple Firefox Instances

If service starts multiple Firefox instances:

1. **Check for existing Firefox**:
   ```bash
   ps aux | grep firefox
   # Kill all if needed
   pkill firefox
   ```

2. **Restart service**:
   ```bash
   systemctl --user restart wa-firefox.service
   ```

## Service Management Commands

```bash
# Start service
systemctl --user start wa-firefox.service

# Stop service
systemctl --user stop wa-firefox.service

# Restart service
systemctl --user restart wa-firefox.service

# Check status
systemctl --user status wa-firefox.service

# View logs
journalctl --user -u wa-firefox.service -f

# Disable auto-start
systemctl --user disable wa-firefox.service

# Enable auto-start
systemctl --user enable wa-firefox.service
```

## Advanced: Start with Specific Profile

If Firefox has multiple profiles:

1. **Find profile name**:
   ```bash
   cat ~/.mozilla/firefox/profiles.ini
   ```

2. **Update service file**:
   ```bash
   nano ~/.config/systemd/user/wa-firefox.service
   ```

   Change `ExecStart` to:
   ```ini
   ExecStart=/usr/bin/firefox -P default-release --no-remote
   ```

   (Replace `default-release` with actual profile name)

## Advanced: Start with Pre-Opened Tabs

If you want Firefox to open specific URLs on start:

1. **Create startup script**:
   ```bash
   nano ~/start-firefox.sh
   ```

   Add:
   ```bash
   #!/bin/bash
   sleep 5  # Wait for display
   firefox &
   sleep 10  # Wait for Firefox to start
   # Firefox will restore previous session automatically
   ```

2. **Make executable**:
   ```bash
   chmod +x ~/start-firefox.sh
   ```

3. **Update service file**:
   ```bash
   nano ~/.config/systemd/user/wa-firefox.service
   ```

   Change `ExecStart` to:
   ```ini
   ExecStart=/home/wa/start-firefox.sh
   ```

   (Note: Not needed if session restore is working)

## Verification Checklist

After setup:

- [ ] Service file exists: `~/.config/systemd/user/wa-firefox.service`
- [ ] Service is enabled: `systemctl --user is-enabled wa-firefox.service` → `enabled`
- [ ] Service is running: `systemctl --user status wa-firefox.service` → `active (running)`
- [ ] Firefox process exists: `ps aux | grep firefox` → shows firefox process
- [ ] After reboot: Firefox starts automatically (test by rebooting)
- [ ] After reboot: All 30 tabs are restored (check via remote desktop)

## Notes

- **User systemd**: Services run in user context, don't require root
- **Lingering**: Required so services start without user login (enabled in `setup_remote_desktop.sh`)
- **Display**: Service assumes `DISPLAY=:0` (default for first X session)
- **Session restore**: Firefox's built-in session restore handles tab restoration (no custom script needed)
