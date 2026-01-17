#!/bin/bash
# setup_remote_desktop.sh - Setup remote desktop access (XFCE + x11vnc + noVNC)
# Run as: sudo bash setup_remote_desktop.sh

set -e  # Exit on error

echo "========================================="
echo "Remote Desktop Setup (XFCE + x11vnc + noVNC)"
echo "========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Error: Please run as root (use sudo)"
    exit 1
fi

# Check if user 'wa' exists
if ! id "wa" &>/dev/null; then
    echo "Error: User 'wa' not found. Run setup_server.sh first."
    exit 1
fi

# Prompt for VNC password
echo ""
echo "Enter VNC password for user 'wa' (will be used for x11vnc and noVNC):"
echo "Password should be at least 8 characters."
read -s VNC_PASSWORD
echo "Confirm VNC password:"
read -s VNC_PASSWORD_CONFIRM

if [ "$VNC_PASSWORD" != "$VNC_PASSWORD_CONFIRM" ]; then
    echo "Error: Passwords do not match"
    exit 1
fi

if [ ${#VNC_PASSWORD} -lt 8 ]; then
    echo "Error: Password must be at least 8 characters"
    exit 1
fi

# Install noVNC
echo "[1/5] Installing noVNC..."
cd /tmp
if [ ! -d "noVNC" ]; then
    git clone https://github.com/novnc/noVNC.git
fi
cd noVNC
git checkout v1.4.0  # Use stable version

# Copy noVNC to /opt
cp -r /tmp/noVNC /opt/noVNC
chown -R wa:wa /opt/noVNC

# Install noVNC dependencies
apt-get install -y python3-websockify

# Configure x11vnc for user 'wa'
echo "[2/5] Configuring x11vnc..."
# Store password in .vnc directory
sudo -u wa mkdir -p /home/wa/.vnc
echo "$VNC_PASSWORD" | sudo -u wa x11vnc -storepasswd /home/wa/.vnc/passwd
chmod 600 /home/wa/.vnc/passwd

# Create x11vnc service file (user systemd service)
echo "[3/5] Creating x11vnc systemd service..."
sudo -u wa mkdir -p /home/wa/.config/systemd/user

cat > /tmp/x11vnc.service <<EOF
[Unit]
Description=x11vnc server for user wa
After=graphical-session.target

[Service]
Type=simple
ExecStart=/usr/bin/x11vnc -display :0 -forever -loop -noxdamage -repeat -rfbauth /home/wa/.vnc/passwd -rfbport 5900 -shared -o /home/wa/.vnc/x11vnc.log
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cp /tmp/x11vnc.service /home/wa/.config/systemd/user/x11vnc.service
chown wa:wa /home/wa/.config/systemd/user/x11vnc.service

# Create noVNC service file
echo "[4/5] Creating noVNC systemd service..."
cat > /tmp/novnc.service <<EOF
[Unit]
Description=noVNC web interface
After=x11vnc.service

[Service]
Type=simple
ExecStart=/usr/bin/websockify --web=/opt/noVNC --target-config=/opt/noVNC/vnc_auto.html 6080 localhost:5900
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cp /tmp/novnc.service /home/wa/.config/systemd/user/novnc.service
chown wa:wa /home/wa/.config/systemd/user/novnc.service

# Enable lingering for user 'wa' (allows systemd user services without login)
echo "[5/5] Enabling systemd lingering for user 'wa'..."
loginctl enable-linger wa

# Setup display for user 'wa'
echo "Setting up X11 display..."
sudo -u wa bash <<EOF
export DISPLAY=:0
xauth add :0 . \$(mcookie)
EOF

# Configure firewall (optional - only if ufw is enabled)
if command -v ufw &> /dev/null; then
    echo ""
    read -p "Configure firewall (ufw)? Open ports 6080 (noVNC) and 5900 (VNC)? [y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ufw allow 6080/tcp comment "noVNC web interface"
        ufw allow 5900/tcp comment "x11vnc server"
        echo "Firewall rules added. Ports 6080 and 5900 are open."
        echo "For security, consider using SSH tunnel instead."
    fi
fi

# Instructions for starting services
echo ""
echo "========================================="
echo "Remote Desktop Setup Complete!"
echo "========================================="
echo ""
echo "Services installed:"
echo "  - x11vnc (VNC server on port 5900)"
echo "  - noVNC (web interface on port 6080)"
echo ""
echo "To start services, run as user 'wa':"
echo "  su - wa"
echo "  systemctl --user daemon-reload"
echo "  systemctl --user start x11vnc"
echo "  systemctl --user start novnc"
echo "  systemctl --user enable x11vnc"
echo "  systemctl --user enable novnc"
echo ""
echo "To start services automatically, also run:"
echo "  systemctl --user start display-manager  # Or configure auto-login"
echo ""
echo "Access methods:"
echo "  1. Web browser: http://YOUR_SERVER_IP:6080/vnc.html"
echo "  2. VNC client: YOUR_SERVER_IP:5900"
echo ""
echo "Password: (the one you just entered)"
echo ""
echo "Security note:"
echo "  For production, use SSH tunnel:"
echo "    ssh -L 6080:localhost:6080 wa@YOUR_SERVER_IP"
echo "    Then access: http://localhost:6080/vnc.html"
echo ""

# Alternative: XRDP setup (documented in README as alternative)
echo ""
echo "========================================="
echo "Alternative: XRDP (if noVNC doesn't work)"
echo "========================================="
echo ""
echo "To use XRDP instead (Windows RDP compatible):"
echo "  sudo apt-get install xrdp"
echo "  sudo systemctl enable xrdp"
echo "  sudo systemctl start xrdp"
echo "  sudo adduser wa ssl-cert"
echo ""
echo "Then connect with:"
echo "  RDP client → YOUR_SERVER_IP:3389"
echo "  Username: wa"
echo "  Password: (user wa's password)"
echo ""
