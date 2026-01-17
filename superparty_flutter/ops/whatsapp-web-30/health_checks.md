# Health Checks and Monitoring

Guide to verify stability, detect issues, and maintain the WhatsApp Web 30-session setup.

## Daily Health Checks

### Quick Visual Check

1. **Access remote desktop**: `http://YOUR_SERVER_IP:6080/vnc.html`

2. **Verify Firefox is running**:
   - Firefox window should be visible
   - Should show 30 pinned tabs (with pin icon)

3. **Check for logout warnings**:
   - Scan tabs for "Please scan QR code" messages
   - If found: Note which container, re-scan QR

4. **Verify container badges**:
   - Each tab should show container icon/badge in address bar
   - Hover over tabs → tooltip shows container name (WA-01, WA-02, etc.)

### Automated Checks (Scripts)

Create a simple health check script:

```bash
#!/bin/bash
# health_check.sh - Quick health check script

echo "=== WhatsApp Web Health Check ==="
echo ""

# Check Firefox is running
if pgrep -x firefox > /dev/null; then
    echo "✅ Firefox is running"
else
    echo "❌ Firefox is NOT running"
fi

# Check profile directory exists
if [ -d "$HOME/.mozilla/firefox" ]; then
    echo "✅ Firefox profile directory exists"
    PROFILE_COUNT=$(ls -d $HOME/.mozilla/firefox/*.default* 2>/dev/null | wc -l)
    echo "   Profile count: $PROFILE_COUNT"
else
    echo "❌ Firefox profile directory NOT found"
fi

# Check session store exists
SESSION_STORE=$(find $HOME/.mozilla/firefox -name "sessionstore.jsonlz4" 2>/dev/null | head -1)
if [ -n "$SESSION_STORE" ]; then
    echo "✅ Session store file exists: $SESSION_STORE"
    SESSION_AGE=$(stat -c %Y "$SESSION_STORE" 2>/dev/null || stat -f %m "$SESSION_STORE" 2>/dev/null)
    NOW=$(date +%s)
    AGE_HOURS=$(( ($NOW - $SESSION_AGE) / 3600 ))
    echo "   Last updated: $AGE_HOURS hours ago"
else
    echo "⚠️  Session store file NOT found (Firefox may not have run yet)"
fi

# Check backups directory
if [ -d "$HOME/backups" ]; then
    echo "✅ Backups directory exists"
    BACKUP_COUNT=$(find $HOME/backups -name "firefox-profile-*.tar.gz" | wc -l)
    echo "   Backup count: $BACKUP_COUNT"
    if [ $BACKUP_COUNT -gt 0 ]; then
        LATEST_BACKUP=$(find $HOME/backups -name "firefox-profile-*.tar.gz" -type f -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)
        BACKUP_AGE=$(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || stat -f %m "$LATEST_BACKUP" 2>/dev/null)
        BACKUP_AGE_HOURS=$(( ($NOW - $BACKUP_AGE) / 3600 ))
        echo "   Latest backup: $BACKUP_AGE_HOURS hours ago"
    fi
else
    echo "⚠️  Backups directory NOT found"
fi

# Check systemd service
if systemctl --user is-active wa-firefox.service > /dev/null 2>&1; then
    echo "✅ Firefox systemd service is active"
elif systemctl --user is-enabled wa-firefox.service > /dev/null 2>&1; then
    echo "⚠️  Firefox systemd service is enabled but not active"
else
    echo "❌ Firefox systemd service is NOT enabled"
fi

echo ""
echo "=== Check Complete ==="
```

Save as `/home/wa/health_check.sh` and make executable:
```bash
chmod +x /home/wa/health_check.sh
```

Run daily:
```bash
/home/wa/health_check.sh
```

## Common Issues and Solutions

### Issue 1: Firefox Not Running

**Symptoms:**
- No Firefox window in remote desktop
- `ps aux | grep firefox` returns nothing

**Causes:**
- Firefox crashed
- Service stopped
- System reboot without auto-start configured

**Solution:**
```bash
# Check service status
systemctl --user status wa-firefox.service

# If stopped, start it
systemctl --user start wa-firefox.service

# Check logs
journalctl --user -u wa-firefox.service -n 50

# Manual start (if service fails)
firefox &
```

### Issue 2: Tabs Not Restoring

**Symptoms:**
- Firefox opens but shows empty/new tab
- No previous session restored

**Causes:**
- Firefox preferences not configured correctly
- Session store file corrupted or missing
- Profile directory issues

**Solution:**

1. **Check Firefox preferences**:
   - Open Firefox → Settings → General → Startup
   - Ensure "Open previous windows and tabs" is selected

2. **Check session store**:
   ```bash
   ls -la ~/.mozilla/firefox/*/sessionstore.jsonlz4
   # Should show file with recent timestamp
   ```

3. **Check about:config**:
   - Open `about:config`
   - Search: `browser.startup.page`
   - Ensure value is: `3` (restore previous session)

4. **Restore from backup** (if needed):
   ```bash
   pkill firefox
   cd ~/.mozilla/firefox/
   tar -xzf ~/backups/firefox-profile-YYYYMMDD.tar.gz
   firefox &
   ```

### Issue 3: Session Logged Out (QR Code Required)

**Symptoms:**
- Tab shows "Please scan QR code" instead of WhatsApp interface
- Green checkmark missing

**Causes:**
- WhatsApp invalidated session (normal after 30+ days inactivity)
- Cookies cleared accidentally
- WhatsApp security action (suspicious activity, etc.)

**Solution:**

1. **Re-scan QR code**:
   - Click on the affected tab
   - Open WhatsApp on corresponding phone
   - Settings → Linked Devices → Link a Device
   - Scan QR code shown in Firefox

2. **Prevention** (to reduce logouts):
   - Keep tabs open (don't close Firefox)
   - Avoid clearing cookies manually
   - Don't use same WhatsApp account in multiple containers
   - Keep IP address stable (avoid frequent VPN changes)

**Note:** This is normal behavior. WhatsApp may log out sessions for security. No automation is needed; just re-scan QR.

### Issue 4: Container Tabs Mixed Up

**Symptoms:**
- Tab shows wrong WhatsApp account
- Container icon doesn't match expected account

**Causes:**
- Tab opened in wrong container
- Container assignment changed

**Solution:**

1. **Verify container assignment**:
   - Click tab → address bar shows container icon
   - Hover over container icon → shows container name

2. **Fix wrong container**:
   - Close tab (if safe)
   - Create new tab → Select correct container
   - Navigate to `web.whatsapp.com`
   - Re-login if needed

3. **Prevention**:
   - Always verify container before opening WhatsApp Web
   - Pin tabs to prevent accidental moves
   - Use different colors/icons per container group

### Issue 5: Cookies/Site Data Cleared

**Symptoms:**
- All or multiple sessions logged out simultaneously
- Cookies directory empty or missing

**Causes:**
- Firefox privacy settings cleared cookies on exit
- Manual cookie clearing
- Profile corruption

**Solution:**

1. **Check Firefox settings**:
   - Settings → Privacy & Security → Cookies and Site Data
   - Ensure "Delete cookies and site data when Firefox is closed" is **UNCHECKED**

2. **Check about:config**:
   - `privacy.clearOnShutdown.cookies` → `false`
   - `privacy.sanitize.sanitizeOnShutdown` → `false`

3. **Restore from backup** (if cookies were cleared):
   ```bash
   pkill firefox
   cd ~/.mozilla/firefox/
   tar -xzf ~/backups/firefox-profile-YYYYMMDD.tar.gz
   firefox &
   ```

### Issue 6: High Memory Usage

**Symptoms:**
- Server running slow
- Firefox using excessive RAM (>10 GB)

**Causes:**
- Too many tabs open (30 tabs × 200-300 MB each = 6-9 GB normal)
- Memory leaks
- Unclosed background processes

**Solution:**

1. **Check memory usage**:
   ```bash
   ps aux | grep firefox | awk '{sum+=$6} END {print sum/1024 " MB"}'
   # Normal: 6-9 GB for 30 tabs
   ```

2. **If excessive (>15 GB)**:
   - Restart Firefox (will restore tabs automatically)
   - Split tabs into multiple windows (10 tabs per window)

3. **Monitor over time**:
   ```bash
   watch -n 60 'ps aux | grep firefox | awk "{sum+=\$6} END {print sum/1024 \" MB\"}"'
   ```

### Issue 7: Remote Desktop Not Accessible

**Symptoms:**
- Cannot connect to `http://YOUR_SERVER_IP:6080/vnc.html`
- VNC connection fails

**Causes:**
- x11vnc/noVNC services stopped
- Firewall blocking ports
- Network issues

**Solution:**

1. **Check services**:
   ```bash
   systemctl --user status x11vnc
   systemctl --user status novnc
   ```

2. **Restart services**:
   ```bash
   systemctl --user restart x11vnc
   systemctl --user restart novnc
   ```

3. **Check firewall**:
   ```bash
   sudo ufw status
   # Ensure ports 6080 and 5900 are allowed
   ```

4. **Check if ports are listening**:
   ```bash
   netstat -tlnp | grep -E '6080|5900'
   # Should show LISTEN for both ports
   ```

## Stability Mitigations

### Keep IP Stable

- **Avoid VPN changes**: WhatsApp may log out sessions if IP changes frequently
- **Use static IP**: Configure server with static IP if possible
- **Monitor IP changes**: Log IP changes if using dynamic IP

### Avoid Clearing Cookies

- **Never clear cookies manually** in Firefox settings
- **Disable extensions** that auto-clear cookies
- **Verify privacy settings** periodically

### Keep Firefox Running

- **Don't close Firefox** unnecessarily (restart only if needed)
- **Enable systemd auto-start** so Firefox restarts after reboot
- **Monitor crashes**: Check `journalctl --user -u wa-firefox.service` for errors

### Regular Backups

- **Enable daily backups** via cron (see `backup_profile.sh`)
- **Verify backups** are created and restorable
- **Test restore procedure** periodically

### Monitor Disk Space

```bash
# Check disk usage
df -h

# Check backup directory size
du -sh ~/backups/

# Clean old backups if needed (backup_profile.sh does this automatically after 30 days)
```

## Logout Frequency Expectations

**Normal behavior:**
- **After reboot**: 0-5 sessions may require QR re-scan (WhatsApp validates sessions)
- **After 30 days inactivity**: WhatsApp may log out sessions automatically
- **After IP change**: WhatsApp may log out sessions as security measure

**Abnormal behavior:**
- **All sessions log out simultaneously**: Likely cookies were cleared (check Firefox settings)
- **Random logouts every few days**: Check for conflicting extensions or privacy settings

## Recovery Procedures

### Complete Profile Corruption

If Firefox profile is completely broken:

1. **Stop Firefox**:
   ```bash
   pkill firefox
   ```

2. **Backup current profile** (in case you need something from it):
   ```bash
   mv ~/.mozilla/firefox ~/.mozilla/firefox.broken
   ```

3. **Restore from backup**:
   ```bash
   cd ~/.mozilla/
   tar -xzf ~/backups/firefox-profile-YYYYMMDD.tar.gz
   ```

4. **Restart Firefox**:
   ```bash
   firefox &
   ```

5. **Re-login any sessions that require QR** (normal after restore)

### Container Data Loss

If one container's cookies are lost:

1. **Re-open WhatsApp Web** in that container
2. **Scan QR code** again
3. **Document**: Note which container for future reference

### System Rebuild

If server needs to be rebuilt:

1. **Backup profile** before rebuild:
   ```bash
   tar -czf ~/firefox-profile-final.tar.gz -C ~/.mozilla firefox/
   ```

2. **Transfer backup** to safe location (off-server)

3. **After rebuild**: Follow setup scripts again

4. **Restore profile** from backup

5. **Re-login** any sessions that require QR (normal after restore)

## Validation Checklist

Use this checklist to verify stability:

- [ ] Firefox is running (process exists)
- [ ] 30 tabs are visible and pinned
- [ ] All tabs show container icons/badges
- [ ] Session store file exists and is recent (<24 hours old)
- [ ] Most sessions are logged in (<5 requiring QR is normal)
- [ ] Backups are created daily (check `/home/wa/backups/`)
- [ ] Systemd service is active: `systemctl --user is-active wa-firefox.service`
- [ ] Remote desktop is accessible
- [ ] Memory usage is normal (6-9 GB for 30 tabs)
- [ ] No Firefox crash logs in `~/.mozilla/firefox/crashreporter/`

## Automation Ideas (Optional)

### Daily Health Check Email

Add to cron:
```bash
0 8 * * * /home/wa/health_check.sh | mail -s "WhatsApp Web Health Check" your@email.com
```

### Alert on Firefox Crash

Create systemd service override:
```bash
mkdir -p ~/.config/systemd/user/wa-firefox.service.d/
nano ~/.config/systemd/user/wa-firefox.service.d/override.conf
```

Add:
```ini
[Service]
ExecStartPost=/usr/bin/logger "Firefox crashed - check logs"
```

Then configure `logger` to send alerts (if needed).

## Notes

- **Logout is normal**: WhatsApp may log out sessions periodically for security
- **No automation for login**: QR code must be scanned manually (by design)
- **Container isolation**: Each container has separate cookies; losing one doesn't affect others
- **Backup frequency**: Daily backups are recommended; adjust retention as needed
