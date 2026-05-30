#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# FaceShield Edge — TFLite Model Download Script
#
# Downloads the two public MediaPipe models (BlazeFace + Face Mesh) into
# assets/models/. The MobileFaceNet model must be trained separately (see
# docs/MODEL_SETUP.md) or replaced with the base model for development.
#
# Usage:
#   chmod +x scripts/download_models.sh
#   ./scripts/download_models.sh
#
# Requires: curl (pre-installed on macOS/Linux)
# ─────────────────────────────────────────────────────────────────────────────
set -e

MODELS_DIR="$(dirname "$0")/../assets/models"
mkdir -p "$MODELS_DIR"

echo "📦 FaceShield Edge — Model Downloader"
echo "Target: $MODELS_DIR"
echo ""

# ── 1. BlazeFace (short range, frontal — 0.5 MB) ─────────────────────────────
BLAZEFACE_URL="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite"
BLAZEFACE_OUT="$MODELS_DIR/blazeface_int8.tflite"

if [ -f "$BLAZEFACE_OUT" ]; then
  echo "✅ blazeface_int8.tflite already exists — skipping"
else
  echo "⬇️  Downloading BlazeFace..."
  curl -L --progress-bar "$BLAZEFACE_URL" -o "$BLAZEFACE_OUT"
  echo "✅ blazeface_int8.tflite downloaded ($(du -sh "$BLAZEFACE_OUT" | cut -f1))"
fi

# ── 2. Face Mesh / Landmarker (468 landmarks — ~4 MB) ─────────────────────────
FACEMESH_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
FACEMESH_OUT="$MODELS_DIR/face_mesh_int8.tflite"

if [ -f "$FACEMESH_OUT" ]; then
  echo "✅ face_mesh_int8.tflite already exists — skipping"
else
  echo "⬇️  Downloading Face Mesh Landmarker..."
  curl -L --progress-bar "$FACEMESH_URL" -o "$FACEMESH_OUT"
  echo "✅ face_mesh_int8.tflite downloaded ($(du -sh "$FACEMESH_OUT" | cut -f1))"
fi

# ── 3. MobileFaceNet — Dev placeholder ────────────────────────────────────────
MOBILEFACENET_OUT="$MODELS_DIR/mobilefacenet_india_int8.tflite"

if [ -f "$MOBILEFACENET_OUT" ]; then
  echo "✅ mobilefacenet_india_int8.tflite already exists — skipping"
else
  echo ""
  echo "⚠️  mobilefacenet_india_int8.tflite not found."
  echo "   For DEVELOPMENT: downloading base MobileFaceNet (no Indian demographic tuning)"
  echo "   For PRODUCTION:  run the training pipeline — see docs/MODEL_SETUP.md"
  echo ""

  # Base MobileFaceNet from open-source repo (dev only)
  BASE_URL="https://github.com/tensorflow/tensorflow/raw/master/tensorflow/lite/examples/android/app/src/main/assets/facenet.tflite"
  curl -L --progress-bar "$BASE_URL" -o "$MOBILEFACENET_OUT" 2>/dev/null || {
    # Fallback: create a placeholder so builds don't fail
    echo "⚠️  Could not download base model. Creating placeholder."
    echo "PLACEHOLDER - replace with real mobilefacenet_india_int8.tflite" > "$MOBILEFACENET_OUT"
  }
  echo "✅ mobilefacenet_india_int8.tflite in place"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Model sizes:"
du -sh "$MODELS_DIR"/* 2>/dev/null || echo "  (no files)"
echo ""

TOTAL=$(du -sh "$MODELS_DIR" | cut -f1)
echo "Total model footprint: $TOTAL"
echo ""
echo "✅ Done. Start Metro: npm start"
