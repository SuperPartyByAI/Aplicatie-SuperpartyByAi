# Android Studio Minimal Setup for macOS (Apple Silicon M2)

**Goal:** Run Android apps on emulator with minimal disk usage, no Xcode required.

---

## 1. Prerequisites: Command Line Tools Only

**If prompted or if build tools fail, install ONLY Command Line Tools:**

```bash
xcode-select --install
```

**Do NOT install full Xcode.** Command Line Tools are sufficient for Android development.

---

## 2. Install Android Studio

1. Download Android Studio for Mac (Apple Silicon):
   - https://developer.android.com/studio
   - Choose "Mac (Apple Silicon)" version
   - File: `android-studio-*-mac_arm.dmg`

2. Install:
   - Drag Android Studio to Applications
   - Launch Android Studio

3. **First Run Wizard - CRITICAL SETTINGS:**

   **Step 1: Welcome Screen**
   - Click "Next"

   **Step 2: Installation Type**
   - **Select "Custom"** (NOT Standard)
   - Click "Next"

   **Step 3: SDK Components Setup**
   - ✅ **Android SDK** (required)
   - ✅ **Android SDK Platform** (required)
   - ✅ **Android Virtual Device** (required)
   - ❌ **Performance (Intel HAXM)** - SKIP (not needed on Apple Silicon)
   - ❌ **Android SDK Platform-Tools** - SKIP here (we'll install manually)
   - Click "Next"

   **Step 4: SDK Location**
   - Default: `~/Library/Android/sdk` (keep this)
   - Click "Next"

   **Step 5: Emulator Settings**
   - RAM: **2048 MB** (default is fine, can lower to 1536 MB later)
   - Click "Next"

   **Step 6: Verify Settings**
   - Review, click "Finish"

   **Step 7: Download Components**
   - Let it download only what was selected
   - **DO NOT** click "Install" on any additional components that appear

---

## 3. Configure Android Studio Settings (Prevent Auto-Downloads)

**After first launch completes:**

1. **Android Studio → Settings** (macOS: `Android Studio → Preferences` or `Cmd + ,`)

2. **Appearance & Behavior → System Settings → Android SDK**
   - **SDK Platforms tab:**
     - Uncheck "Show Package Details" (to avoid seeing extra options)
     - ✅ Check only: **Android 14.0 (Tiramisu) - API Level 34**
     - ❌ Uncheck all other platforms
     - Click "Apply"

   - **SDK Tools tab:**
     - ✅ **Android SDK Build-Tools** (latest, usually 34.0.0)
     - ✅ **Android SDK Platform-Tools** (latest)
     - ✅ **Android SDK Command-line Tools (latest)**
     - ✅ **Android Emulator**
     - ❌ **Android SDK Command-line Tools (legacy)** - UNCHECK
     - ❌ **NDK (Side by side)** - UNCHECK
     - ❌ **CMake** - UNCHECK
     - ❌ **Google Play services** - UNCHECK
     - ❌ **Google Play Store** - UNCHECK
     - ❌ **Intel x86 Emulator Accelerator (HAXM installer)** - UNCHECK
     - ❌ **Sources for Android** - UNCHECK (optional, saves space)
     - Click "Apply" → "OK"

3. **Appearance & Behavior → System Settings → Updates**
   - **Automatically check for updates:** Uncheck (optional, prevents prompts)
   - **Automatically download updates:** Uncheck

4. **Build, Execution, Deployment → Build Tools → Gradle**
   - **Gradle JDK:** Use embedded JDK (default)
   - **Auto-import:** Keep enabled (but won't download extra SDKs)

5. **Tools → SDK Manager** (alternative path)
   - Same settings as above
   - **Uncheck "Show Package Details"** to avoid confusion

---

## 4. Install Required SDK Components (Manual)

**If not installed during wizard, use SDK Manager:**

**Android Studio → Tools → SDK Manager → SDK Platforms:**
- ✅ **Android 14.0 (Tiramisu) - API Level 34**
  - **Why API 34?** Latest stable, good compatibility, modern features
  - Uncheck all other API levels

**SDK Tools tab:**
- ✅ **Android SDK Build-Tools 34.0.0** (or latest)
- ✅ **Android SDK Platform-Tools** (latest)
- ✅ **Android SDK Command-line Tools (latest)**
- ✅ **Android Emulator**

Click "Apply" → Wait for download → "OK"

---

## 5. Create ONE AVD (Android Virtual Device)

1. **Android Studio → Tools → Device Manager**

2. Click **"Create Device"**

3. **Select Hardware:**
   - Choose **"Pixel 5"** (or Pixel 6, Pixel 7)
   - Click "Next"

4. **Select System Image:**
   - **CRITICAL:** Choose **ARM64-v8a** image (NOT x86_64)
   - Look for: **"Tiramisu" (API 34) - ARM 64 v8a**
   - **Prefer:** "Google APIs ARM 64 v8a" (smaller than Play Store)
   - **Avoid:** "Google Play" images (larger, not needed unless you need Play Store)
   - If image not downloaded, click download icon → wait → select it
   - Click "Next"

5. **AVD Configuration:**
   - **AVD Name:** `pixel5_api34` (or similar)
   - **Startup orientation:** Portrait
   - **Advanced Settings:**
     - **RAM:** **1536 MB** (or 2048 MB if you have 16GB+ RAM)
     - **VM heap:** 256 MB
     - **Internal Storage:** 2048 MB (default, can lower to 1024 MB if needed)
     - **SD Card:** 512 MB (or remove if not needed)
   - Click "Finish"

6. **Verify:**
   - AVD appears in Device Manager
   - Click ▶️ (Play) to start emulator
   - First boot takes 1-2 minutes

---

## 6. Environment Variables (zsh)

**Add to `~/.zshrc`:**

```bash
# Android SDK
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
export PATH=$PATH:$ANDROID_SDK_ROOT/tools
export PATH=$PATH:$ANDROID_SDK_ROOT/tools/bin
```

**Apply changes:**
```bash
source ~/.zshrc
```

---

## 7. Verification Commands

**Run these to verify setup:**

```bash
# Check SDK location
echo $ANDROID_SDK_ROOT
# Should output: /Users/yourusername/Library/Android/sdk

# Check ADB
adb version
# Should show: Android Debug Bridge version X.X.XX

# Check Emulator
emulator -version
# Should show: Android Emulator version X.X.XX

# List installed SDK packages
sdkmanager --list_installed
# Should show only API 34, build-tools, platform-tools, emulator, cmdline-tools

# Check available system images (ARM64 only)
sdkmanager --list | grep "system-images" | grep "arm64"
# Should show ARM64 images for API 34
```

---

## 8. Disk Usage Optimization

**Already done:**
- ✅ Only API 34 installed
- ✅ Only one AVD created
- ✅ ARM64 system image (smaller than x86)
- ✅ Reduced RAM/Storage in AVD

**Additional savings (optional):**
- Delete unused AVDs: Device Manager → right-click → Delete
- Clean old build artifacts: `Android Studio → Build → Clean Project`
- Remove old Gradle caches: `rm -rf ~/.gradle/caches` (if needed)

**Expected disk usage:**
- Android Studio: ~1.5 GB
- SDK (API 34 + tools): ~2-3 GB
- Emulator system image (ARM64): ~1-1.5 GB
- AVD data: ~500 MB
- **Total: ~5-6 GB** (vs 15-20 GB with full setup)

---

## 9. Troubleshooting

### Issue: "Xcode required" error

**Solution:** Only Command Line Tools needed:
```bash
xcode-select --install
# If already installed:
xcode-select -p
# Should show: /Library/Developer/CommandLineTools
```

### Issue: Emulator won't start / "HAXM not available"

**Solution:** This is normal on Apple Silicon. HAXM is Intel-only. Use ARM64 system images only.

### Issue: "No system images installed"

**Solution:**
1. SDK Manager → SDK Platforms → Show Package Details
2. Check "Android 14.0 (Tiramisu) - API Level 34"
3. Expand it → Check "Google APIs ARM 64 v8a System Image"
4. Apply → Download

### Issue: PATH not working

**Solution:**
```bash
# Check current PATH
echo $PATH

# Verify SDK location exists
ls -la $HOME/Library/Android/sdk

# Manually add to current session
export ANDROID_SDK_ROOT=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_SDK_ROOT/platform-tools
export PATH=$PATH:$ANDROID_SDK_ROOT/emulator

# Test
adb version
```

### Issue: Android Studio keeps prompting for extra SDKs

**Solution:**
1. Settings → Appearance & Behavior → System Settings → Android SDK
2. Uncheck "Show Package Details"
3. Uncheck all platforms except API 34
4. SDK Tools → Uncheck everything except required items (see section 3)
5. Click "Apply"

### Issue: Emulator is slow

**Solution:**
- Use ARM64 images (already done)
- Reduce AVD RAM to 1536 MB
- Close other apps
- Enable hardware acceleration (should be automatic on M2)

---

## 10. Quick Reference: Menu Paths

**SDK Manager:**
- `Android Studio → Tools → SDK Manager`
- Or: `Android Studio → Settings → Appearance & Behavior → System Settings → Android SDK`

**Device Manager:**
- `Android Studio → Tools → Device Manager`

**AVD Configuration:**
- `Device Manager → Create Device → [Select Hardware] → [Select System Image] → [Configure AVD]`

**Disable Auto-Updates:**
- `Android Studio → Settings → Appearance & Behavior → System Settings → Updates`

---

## Summary Checklist

- [ ] Installed Command Line Tools (if needed): `xcode-select --install`
- [ ] Downloaded Android Studio (Mac ARM64)
- [ ] Completed first-run wizard with "Custom" installation
- [ ] Installed only API 34 (Android 14.0)
- [ ] Installed only required SDK Tools (Build-Tools, Platform-Tools, Command-line Tools, Emulator)
- [ ] Created ONE AVD with ARM64 system image
- [ ] Configured AVD with reduced RAM/Storage
- [ ] Disabled auto-updates in Settings
- [ ] Added environment variables to `~/.zshrc`
- [ ] Verified with `adb version` and `emulator -version`

---

**You're ready to run Android apps on the emulator!** 🚀
