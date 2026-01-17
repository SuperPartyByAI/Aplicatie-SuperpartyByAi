#!/bin/bash
# backup_profile.sh - Backup Firefox profile for WhatsApp Web sessions
# Usage: Run daily via cron or manually
# Location: /home/wa/backup_profile.sh

set -e  # Exit on error

# Configuration
BACKUP_DIR="/home/wa/backups"
PROFILE_DIR="/home/wa/.mozilla/firefox"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/firefox-profile-$TIMESTAMP.tar.gz"
LOG_FILE="$BACKUP_DIR/backup.log"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Log function
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "Starting Firefox profile backup..."

# Check if profile directory exists
if [ ! -d "$PROFILE_DIR" ]; then
    log "ERROR: Profile directory not found: $PROFILE_DIR"
    exit 1
fi

# Find Firefox profile (usually ends with .default-release or similar)
PROFILE_NAME=$(ls -d "$PROFILE_DIR"/*.default* 2>/dev/null | head -1 | xargs basename)

if [ -z "$PROFILE_NAME" ]; then
    log "WARNING: No default profile found. Backing up entire firefox directory."
    PROFILE_NAME=""
    SOURCE_DIR="$PROFILE_DIR"
else
    log "Found profile: $PROFILE_NAME"
    SOURCE_DIR="$PROFILE_DIR/$PROFILE_NAME"
fi

# Check if Firefox is running (optional: skip if running to avoid conflicts)
if pgrep -x firefox > /dev/null; then
    log "WARNING: Firefox is running. Backup may include locked files."
    log "Consider stopping Firefox before backup for complete consistency."
    # Continue anyway (Firefox locks are usually fine for backup)
fi

# Create backup
log "Creating backup: $BACKUP_FILE"
cd "$PROFILE_DIR"

# Backup profile directory (exclude large cache files to save space)
tar -czf "$BACKUP_FILE" \
    --exclude='cache2' \
    --exclude='startupCache' \
    --exclude='storage/default/http*' \
    --exclude='*.tmp' \
    "$PROFILE_NAME" 2>&1 | tee -a "$LOG_FILE"

# Verify backup was created
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup created successfully: $BACKUP_FILE ($BACKUP_SIZE)"
else
    log "ERROR: Backup file was not created!"
    exit 1
fi

# Cleanup old backups (keep last 30 days)
log "Cleaning up old backups (keeping last 30 days)..."
find "$BACKUP_DIR" -name "firefox-profile-*.tar.gz" -type f -mtime +30 -delete 2>&1 | tee -a "$LOG_FILE"

# List remaining backups
BACKUP_COUNT=$(find "$BACKUP_DIR" -name "firefox-profile-*.tar.gz" -type f | wc -l)
log "Total backups retained: $BACKUP_COUNT"

log "Backup completed successfully."

# Optional: Show disk usage
TOTAL_BACKUP_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Total backup directory size: $TOTAL_BACKUP_SIZE"

exit 0
