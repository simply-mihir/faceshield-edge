#!/bin/bash
# FaceShield Edge — Model Download Script
# Downloads all three TFLite models required for on-device inference.

set -e
MODELS_DIR="$(dirname "$0")/../assets/models"
mkdir -p "$MODELS_DIR"

echo "=== FaceShield Edge — Model Download ==="
echo "Target directory: $MODELS_DIR"
echo ""

# ── 1. BlazeFace ──────────────────────────────────────────────
BLAZEFACE_URL="https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite"
BLAZEFACE_DEST="$MODELS_DIR/blazeface_int8.tflite"

if [ -f "$BLAZEFACE_DEST" ] && [ "$(wc -c < "$BLAZEFACE_DEST")" -gt 10000 ]; then
  echo "✅ BlazeFace already downloaded ($(du -sh "$BLAZEFACE_DEST" | cut -f1))"
else
  echo "Downloading BlazeFace..."
  curl -sL "$BLAZEFACE_URL" -o "$BLAZEFACE_DEST" --progress-bar || \
  wget -q --show-progress "$BLAZEFACE_URL" -O "$BLAZEFACE_DEST"
  echo "✅ BlazeFace: $(du -sh "$BLAZEFACE_DEST" | cut -f1)"
fi

# ── 2. MediaPipe Face Mesh ────────────────────────────────────
FACEMESH_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
FACEMESH_DEST="$MODELS_DIR/face_mesh_int8.tflite"

if [ -f "$FACEMESH_DEST" ] && [ "$(wc -c < "$FACEMESH_DEST")" -gt 100000 ]; then
  echo "✅ Face Mesh already downloaded ($(du -sh "$FACEMESH_DEST" | cut -f1))"
else
  echo "Downloading MediaPipe Face Landmarker..."
  curl -sL "$FACEMESH_URL" -o "$FACEMESH_DEST" --progress-bar || \
  wget -q --show-progress "$FACEMESH_URL" -O "$FACEMESH_DEST"
  echo "✅ Face Mesh: $(du -sh "$FACEMESH_DEST" | cut -f1)"
fi

# ── 3. MobileFaceNet India INT8 ───────────────────────────────
MOBILEFACENET_DEST="$MODELS_DIR/mobilefacenet_india_int8.tflite"

if [ -f "$MOBILEFACENET_DEST" ] && [ "$(wc -c < "$MOBILEFACENET_DEST")" -gt 100000 ]; then
  echo "✅ MobileFaceNet already present ($(du -sh "$MOBILEFACENET_DEST" | cut -f1))"
else
  echo ""
  echo "── MobileFaceNet India Model ─────────────────────────────"
  echo "Attempting to download generic MobileFaceNet (fallback for demo)..."

  # Generic MobileFaceNet from TF Hub (not India-specific but functional for demo)
  GENERIC_URL="https://storage.googleapis.com/download.tensorflow.org/models/tflite/task_library/face_recognition/android/mobile_face_net.tflite"
  curl -sL "$GENERIC_URL" -o "$MOBILEFACENET_DEST" --progress-bar 2>/dev/null || \
  wget -q --show-progress "$GENERIC_URL" -O "$MOBILEFACENET_DEST" 2>/dev/null || true

  if [ -f "$MOBILEFACENET_DEST" ] && [ "$(wc -c < "$MOBILEFACENET_DEST")" -gt 100000 ]; then
    echo "✅ MobileFaceNet (generic): $(du -sh "$MOBILEFACENET_DEST" | cut -f1)"
    echo "⚠️  Replace with India-tuned model for >95% accuracy on Indian demographics."
    echo "    See training/TRAINING_GUIDE.md"
  else
    echo "FACESHIELD_MODEL_PLACEHOLDER_v2" > "$MOBILEFACENET_DEST"
    echo "⚠️  Placeholder created — run training pipeline for real model."
  fi
fi

echo ""
echo "=== Model inventory ==="
ls -lh "$MODELS_DIR"
echo "Total: $(du -sh "$MODELS_DIR" | cut -f1)"
