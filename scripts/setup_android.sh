#!/bin/bash
# FaceShield Edge — Android setup script
# Run once after cloning to complete Gradle wrapper setup

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WRAPPER_DIR="$PROJECT_ROOT/android/gradle/wrapper"

echo "=== FaceShield Edge — Android Setup ==="

# 1. Download gradle-wrapper.jar (59 KB — binary bootstrapper)
echo "Downloading gradle-wrapper.jar..."
curl -sL \
  "https://raw.githubusercontent.com/gradle/gradle/v8.6.0/gradle/wrapper/gradle-wrapper.jar" \
  -o "$WRAPPER_DIR/gradle-wrapper.jar" || \
wget -q \
  "https://raw.githubusercontent.com/gradle/gradle/v8.6.0/gradle/wrapper/gradle-wrapper.jar" \
  -O "$WRAPPER_DIR/gradle-wrapper.jar"

# 2. Make gradlew executable
chmod +x "$PROJECT_ROOT/android/gradlew"

echo "✅ Android Gradle wrapper ready"
echo ""
echo "Next steps:"
echo "  cd $PROJECT_ROOT"
echo "  npm install"
echo "  npx react-native run-android"
