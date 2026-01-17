# WhatsApp Web 30-Session Setup Guide

Complete setup for running 30 WhatsApp Web sessions in parallel using Firefox Multi-Account Containers on Ubuntu 22.04 LTS.

## Overview

This setup provides:
- **Remote desktop access** for QR code scanning
- **Firefox with Multi-Account Containers** (30 isolated containers)
- **Session persistence** across reboots
- **Automated backups** of Firefox profile
- **Auto-start** on server reboot

## Architecture

```
Ubuntu 22.04 Server
├── User: wa (dedicated)
├── Firefox Profile: /home/wa/.mozilla/firefox/
├── Remote Desktop: XFCE + x11vnc + noVNC (port 6080)
├── 30 Containers: WA-01 through WA-30
└── Backups: /home/wa/backups/firefox-profile-*.tar.gz
```

## Prerequisites

- Ubuntu 22.04 LTS server (fresh install recommended)
- Root/sudo access
- Minimum 8GB RAM (16GB+ recommended for 30 tabs)
- Stable IP address (avoid frequent VPN changes)
- 20GB+ free disk space for Firefox profile + backups

## Quick Start (TL;DR)

```bash
# 1. Clone/download these files to server
cd /path/to/ops/whatsapp-web-30/

# 2. Run setup scripts as root
sudo bash setup_server.sh
sudo bash setup_remote_desktop.sh

# 3. Switch to wa user and configure Firefox
su - wa
# Follow: install_firefox_and_extension.md
# Follow: firefox_prefs.md
# Follow: create_containers_checklist.md

# 4. Set up auto-start
# Follow: systemd_autostart.md

# 5. Enable backups (optional)
crontab -e
# Add: 0 2 * * * /home/wa/backup_profile.sh
```

## Detailed Steps

### Step 1: Server Setup

Run as root:

```bash
bash setup_server.sh
```

This creates:
- User `wa` with home directory `/home/wa`
- Required packages (firefox, xfce4, x11vnc, etc.)
- Backup directory `/home/wa/backups`

### Step 2: Remote Desktop Setup

Run as root:

```bash
bash setup_remote_desktop.sh
```

This installs and configures:
- XFCE desktop environment
- x11vnc server (VNC on port 5900)
- noVNC web interface (accessible on port 6080)

**Access Methods:**

**Option A: Web Browser (Recommended)**
```
http://YOUR_SERVER_IP:6080/vnc.html
Password: (set during setup_remote_desktop.sh)
```

**Option B: VNC Client**
```
Host: YOUR_SERVER_IP
Port: 5900
Password: (set during setup_remote_desktop.sh)
```

**Security Note:** If exposing to internet, use SSH tunnel:
```bash
# From your local machine
ssh -L 6080:localhost:6080 -L 5900:localhost:5900 wa@YOUR_SERVER_IP
# Then access: http://localhost:6080/vnc.html
```

See `setup_remote_desktop.sh` for firewall configuration.

### Step 3: Firefox Installation & Configuration

Follow these guides in order:

1. **Install Firefox and Extension**
   - See: `install_firefox_and_extension.md`

2. **Configure Firefox for Persistence**
   - See: `firefox_prefs.md`
   - Key settings: restore session, don't clear cookies on exit

3. **Create 30 Containers**
   - See: `create_containers_checklist.md`
   - Creates containers WA-01 through WA-30
   - Opens WhatsApp Web in each container

### Step 4: Login Process (Per Account)

For each of the 30 accounts:

1. **Access remote desktop** (web browser or VNC client)
2. **Open Firefox** (should auto-restore previous session)
3. **Find the container tab** for your account (WA-01, WA-02, etc.)
4. **If logged out:** Click on the tab → scan QR code from that phone
5. **Wait for connection** → green checkmark means logged in
6. **Close the tab** (but keep Firefox running)

**Important:** Each WhatsApp account can only be logged into ONE container. If you try to use the same phone number in multiple containers, WhatsApp will log out the others.

### Step 5: Auto-Start on Reboot

Follow: `systemd_autostart.md`

This ensures:
- Firefox starts automatically after reboot
- Previous session (all 30 tabs) is restored
- Remote desktop is available

### Step 6: Backups (Optional but Recommended)

Enable daily backups:

```bash
crontab -e
# Add this line (runs daily at 2 AM)
0 2 * * * /home/wa/backup_profile.sh
```

Backups are stored in: `/home/wa/backups/firefox-profile-YYYYMMDD-HHMMSS.tar.gz`

**Restore from backup:**
```bash
# Stop Firefox first
pkill firefox

# Restore profile
cd /home/wa/.mozilla/firefox/
tar -xzf /home/wa/backups/firefox-profile-20240116-020000.tar.gz

# Start Firefox again
firefox &
```

### Step 7: Health Checks

See: `health_checks.md`

Regular checks:
- Verify all 30 tabs are open and visible
- Check for "Please scan QR code" messages
- Verify cookies/site data are not being cleared
- Monitor disk space for backups

## Daily Operations

### Normal Use

1. Open remote desktop: `http://YOUR_SERVER_IP:6080/vnc.html`
2. Firefox should already be running with all 30 tabs
3. Check tabs for any "Please scan QR code" messages
4. If logout detected, click that tab → scan QR from corresponding phone
5. Done

### After Reboot

1. Wait 2-3 minutes for systemd to start everything
2. Access remote desktop
3. Firefox should auto-restore with all tabs
4. Some sessions may require QR re-scan (normal if WhatsApp invalidated them)
5. Re-scan only the affected containers

### Adding a New Account

1. Create new container: WA-31 (or next available number)
2. Open WhatsApp Web in that container
3. Scan QR code
4. Done

### Removing an Account

1. Right-click container tab → "Close Tab"
2. Optional: Delete container in Multi-Account Containers settings (not required)

## Performance & Scaling

### Resource Usage

- **RAM:** ~200-300 MB per tab = 6-9 GB for 30 tabs
- **CPU:** Minimal when idle; spikes during QR scans
- **Disk:** ~500 MB profile + ~50 MB per backup

### Optimization Tips

1. **Split into Windows:** Open 3 Firefox windows, 10 tabs each (File → New Window, move tabs)
2. **Disable Extensions:** Only keep Multi-Account Containers active
3. **Close Unused Tabs:** If you don't need all 30, close unused containers
4. **Monitor Memory:** Use `htop` to check RAM usage

### Known Limitations

- **Firefox UI Lag:** 30 tabs in one window can cause UI slowdowns. Solution: split into multiple windows.
- **WhatsApp Session Timeout:** WhatsApp may log out sessions after 30+ days of inactivity. Normal behavior.
- **QR Re-scan:** Some sessions may require QR re-scan after reboot (depends on WhatsApp's session validation).

## Troubleshooting

### Firefox Won't Start

```bash
# Check if already running
ps aux | grep firefox

# Kill if needed
pkill firefox

# Check for errors
firefox 2>&1 | head -20

# Check profile permissions
ls -la /home/wa/.mozilla/firefox/
```

### Remote Desktop Not Accessible

```bash
# Check if x11vnc is running
ps aux | grep x11vnc

# Check firewall
sudo ufw status

# Restart x11vnc
systemctl --user restart x11vnc

# Check logs
journalctl --user -u x11vnc -n 50
```

### Tabs Not Restoring

1. Check Firefox preferences: General → Startup → "Open previous windows and tabs"
2. Verify `browser.sessionstore.resume_from_crash` is `true` in about:config
3. Check if profile directory exists: `/home/wa/.mozilla/firefox/`

### Session Logged Out

**This is normal.** WhatsApp may log out sessions for:
- Long inactivity (30+ days)
- Security reasons
- Multiple device conflicts

**Fix:** Click the tab → scan QR code again. No automation needed.

### Container Tabs Mixed Up

1. Verify each container has a distinct color/icon
2. Always use "Open in New Tab" → select container (don't drag tabs between containers)
3. Pin tabs to prevent accidental closure

## Security Considerations

1. **Firewall:** Expose only necessary ports (6080, 5900) and use SSH tunnel if possible
2. **Strong Passwords:** Use strong VNC password (set during setup)
3. **SSH Keys:** Use SSH key authentication, disable password auth
4. **Updates:** Keep Ubuntu and Firefox updated regularly
5. **Backups:** Encrypt backups if storing sensitive data off-server

## Validation Checklist

Before considering setup complete, verify:

- [ ] Can access remote desktop securely (browser or VNC client)
- [ ] Firefox restores session after manual restart (kill and restart Firefox)
- [ ] 30 containers exist: WA-01, WA-02, ... WA-30
- [ ] Each container has an open WhatsApp Web tab (web.whatsapp.com)
- [ ] At least one account is logged in (green checkmark visible)
- [ ] After reboot: Firefox auto-starts and tabs are restored
- [ ] After reboot: Most sessions remain logged in (some may require QR re-scan - normal)
- [ ] Backups are created daily (check `/home/wa/backups/`)
- [ ] Backups are restorable (test restore procedure)
- [ ] Systemd service is enabled: `systemctl --user is-enabled wa-firefox`

## Recovery Procedures

### Complete Profile Corruption

1. Stop Firefox: `pkill firefox`
2. Backup current profile: `mv ~/.mozilla/firefox ~/.mozilla/firefox.broken`
3. Restore from backup: `tar -xzf /home/wa/backups/firefox-profile-YYYYMMDD.tar.gz -C ~/.mozilla/`
4. Restart Firefox

### Server Rebuild

1. Follow setup scripts again (setup_server.sh, setup_remote_desktop.sh)
2. Restore Firefox profile from backup
3. Re-login any sessions that require QR

### Container Data Loss

If a container's cookies are cleared:
1. Re-open WhatsApp Web in that container
2. Scan QR code again
3. Consider increasing backup frequency

## Support & Maintenance

- **Logs:** Firefox logs in `~/.mozilla/firefox/crashreporter/`
- **Profile Location:** `/home/wa/.mozilla/firefox/`
- **Backup Location:** `/home/wa/backups/`
- **Systemd Service:** `~/.config/systemd/user/wa-firefox.service`

## License & Disclaimer

This setup is for legitimate use of WhatsApp Web. Respect WhatsApp's Terms of Service. No automation or bots are included. Each session requires manual QR code scanning when needed.
