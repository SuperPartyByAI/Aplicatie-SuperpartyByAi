#!/bin/bash
set -e

echo "🚀 SuperParty AAB Build Script v1.2.0+14"
echo "========================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Flutter
if ! command -v flutter &> /dev/null; then
    echo -e "${RED}❌ Flutter not found in PATH${NC}"
    echo "Please install Flutter: https://flutter.dev/docs/get-started/install"
    exit 1
fi

echo -e "${GREEN}✅ Flutter found${NC}"
flutter --version

# Navigate to Flutter project
cd superparty_flutter

# Check version
VERSION=$(grep "version:" pubspec.yaml | awk '{print $2}')
echo -e "${GREEN}📦 Building version: $VERSION${NC}"

if [ "$VERSION" != "1.2.0+14" ]; then
    echo -e "${YELLOW}⚠️  Warning: Version is $VERSION, expected 1.2.0+14${NC}"
fi

# Check signing config
if [ ! -f "android/key.properties" ]; then
    echo -e "${RED}❌ android/key.properties not found${NC}"
    exit 1
fi

if [ ! -f "../superparty-release-key.jks" ]; then
    echo -e "${RED}❌ superparty-release-key.jks not found${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Signing configuration OK${NC}"

# Clean previous builds
echo "🧹 Cleaning previous builds..."
flutter clean

# Get dependencies
echo "📦 Getting dependencies..."
flutter pub get

# Run flutter doctor
echo "🔍 Running flutter doctor..."
flutter doctor

# Build AAB
echo "🔨 Building release AAB..."
flutter build appbundle --release

# Check if build succeeded
AAB_PATH="build/app/outputs/bundle/release/app-release.aab"
if [ -f "$AAB_PATH" ]; then
    SIZE=$(ls -lh "$AAB_PATH" | awk '{print $5}')
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo "📦 AAB location: $AAB_PATH"
    echo "📏 Size: $SIZE"
    
    # Calculate SHA256
    if command -v sha256sum &> /dev/null; then
        SHA256=$(sha256sum "$AAB_PATH" | awk '{print $1}')
        echo "🔐 SHA256: $SHA256"
    fi
    
    echo ""
    echo "🎉 Ready for Play Store upload!"
    echo ""
    echo "Next steps:"
    echo "1. Go to https://play.google.com/console"
    echo "2. Select SuperParty app"
    echo "3. Create new release in Production track"
    echo "4. Upload: $AAB_PATH"
    echo "5. Add release notes and submit for review"
else
    echo -e "${RED}❌ Build failed - AAB not found${NC}"
    exit 1
fi
