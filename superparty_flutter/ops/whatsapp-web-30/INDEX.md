# WhatsApp Web 30-Session Setup - File Index

Quick reference to all files in this setup.

## Main Guide

- **README.md** - Complete step-by-step guide from fresh server to 30 logged-in WhatsApp Web sessions

## Setup Scripts

- **setup_server.sh** - Installs packages, creates user `wa`, sets up directories (run as root)
- **setup_remote_desktop.sh** - Configures XFCE, x11vnc, and noVNC for remote access (run as root)

## Configuration Guides

- **firefox_prefs.md** - Firefox preferences for session persistence (GUI + about:config settings)
- **install_firefox_and_extension.md** - Install Firefox and Multi-Account Containers extension
- **create_containers_checklist.md** - Step-by-step to create 30 containers (WA-01..WA-30) and open WhatsApp Web

## Automation & Maintenance

- **systemd_autostart.md** - Configure Firefox to auto-start on boot
- **wa-firefox.service** - Systemd service file (copy to `~/.config/systemd/user/`)
- **backup_profile.sh** - Daily backup script for Firefox profile (run via cron)
- **health_checks.md** - Monitoring, troubleshooting, and recovery procedures

## Quick Start Order

1. **setup_server.sh** (as root)
2. **setup_remote_desktop.sh** (as root)
3. **install_firefox_and_extension.md** (as user `wa`)
4. **firefox_prefs.md** (as user `wa`, in Firefox)
5. **create_containers_checklist.md** (as user `wa`, in Firefox)
6. **systemd_autostart.md** (as user `wa`)
7. **backup_profile.sh** (add to cron as user `wa`)

## File Locations After Setup

- Firefox profile: `/home/wa/.mozilla/firefox/`
- Backups: `/home/wa/backups/`
- Systemd service: `/home/wa/.config/systemd/user/wa-firefox.service`
- Backup script: `/home/wa/backup_profile.sh`

## Support

- Issues: See `health_checks.md` for troubleshooting
- Recovery: See `health_checks.md` → Recovery Procedures
- Validation: See `README.md` → Validation Checklist
