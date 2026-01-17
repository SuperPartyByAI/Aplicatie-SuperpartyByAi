#!/bin/bash
# setup_server.sh - Initial server setup for WhatsApp Web 30-session setup
# Run as: sudo bash setup_server.sh

set -e  # Exit on error

echo "========================================="
echo "WhatsApp Web 30-Session Server Setup"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (use sudo)"
    exit 1
fi

# Update system
echo "[1/7] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# Install base packages
echo "[2/7] Installing base packages..."
apt-get install -y \
    curl \
    wget \
    git \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release \
    sudo

# Create dedicated user 'wa'
echo "[3/7] Creating dedicated user 'wa'..."
if id "wa" &>/dev/null; then
    echo "User 'wa' already exists. Skipping creation."
else
    useradd -m -s /bin/bash wa
    echo "User 'wa' created."
fi

# Add wa to sudo group (optional, for maintenance)
usermod -aG sudo wa

# Create backup directory
echo "[4/7] Creating backup directory..."
mkdir -p /home/wa/backups
chown wa:wa /home/wa/backups
chmod 755 /home/wa/backups

# Install Firefox dependencies
echo "[5/7] Installing Firefox dependencies..."
apt-get install -y \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    libxt6 \
    libx11-xcb1 \
    libasound2 \
    libpulse0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2-dev \
    libgconf-2-4 \
    libxinerama1 \
    libxcursor1

# Install desktop environment dependencies (for XFCE)
echo "[6/7] Installing desktop environment dependencies..."
apt-get install -y \
    xfce4 \
    xfce4-goodies \
    xfce4-terminal \
    xfce4-session

# Install VNC and remote desktop tools
echo "[7/7] Installing VNC and remote desktop tools..."
apt-get install -y \
    x11vnc \
    tigervnc-common \
    websockify \
    python3 \
    python3-numpy

# Copy backup script
echo "Copying backup script..."
if [ -f "backup_profile.sh" ]; then
    cp backup_profile.sh /home/wa/backup_profile.sh
    chown wa:wa /home/wa/backup_profile.sh
    chmod +x /home/wa/backup_profile.sh
    echo "Backup script installed: /home/wa/backup_profile.sh"
else
    echo "Warning: backup_profile.sh not found. Please copy it manually."
fi

# Summary
echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Created:"
echo "  - User: wa (home: /home/wa)"
echo "  - Backup directory: /home/wa/backups"
echo ""
echo "Next steps:"
echo "  1. Run: sudo bash setup_remote_desktop.sh"
echo "  2. Then switch to wa user: su - wa"
echo "  3. Follow: install_firefox_and_extension.md"
echo ""
echo "To set user password (optional):"
echo "  sudo passwd wa"
echo ""
