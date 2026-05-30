# FaceShield Edge — TFLite Model Setup

The three TFLite model files are **not included** in the repository (binary files, tracked via Git LFS or downloaded separately).

## Required Model Files

Place these files in `assets/models/`:

| File | Size | Source |
|------|------|--------|
| `blazeface_int8.tflite` | ~0.5 MB | Google MediaPipe Model Card |
| `face_mesh_int8.tflite` | ~5.0 MB | Google MediaPipe Model Card |
| `mobilefacenet_india_int8.tflite` | ~5.0 MB | Fine-tuned (see Training Guide) |

---

## Download BlazeFace + Face Mesh (public models)

```bash
# Create models directory
mkdir -p assets/models

# BlazeFace (short range, frontal camera)
curl -L "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite" \
  -o assets/models/blazeface_int8.tflite

# Face Mesh (468 landmarks)
curl -L "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task" \
  -o assets/models/face_mesh_int8.tflite
```

---

## MobileFaceNet — Indian Demographic Fine-Tuned Model

The `mobilefacenet_india_int8.tflite` model is produced by the parallel training pipeline (Phase 6 of the roadmap).

### Quick start — use the base MobileFaceNet for development

```bash
# Base MobileFaceNet (no Indian demographic tuning — for dev/testing only)
curl -L "https://github.com/nicehash/tensorflow-facenet/raw/master/models/mobilefacenet_tflite/mobilefacenet.tflite" \
  -o assets/models/mobilefacenet_india_int8.tflite
```

### For production — run the training pipeline

See `training/TRAINING_GUIDE.md` for the full ArcFace → MobileFaceNet knowledge distillation pipeline.

Steps:
1. Prepare VGGFace2 South Asian subset + augmentation
2. Fine-tune ArcFace teacher on Indian demographics
3. Run distillation to MobileFaceNet student
4. INT8 quantisation via TFLite converter
5. Threshold calibration on held-out Indian demographic test set

---

## Verify model placement

```bash
ls -lh assets/models/
# Expected output:
# blazeface_int8.tflite         ~500KB
# face_mesh_int8.tflite         ~5.0MB
# mobilefacenet_india_int8.tflite ~5.0MB
# Total: ~11MB  (well under 20MB ceiling)
```

---

## Android: Bundle in APK

Models in `assets/models/` are automatically bundled by Metro/Gradle.

No additional configuration needed.

## iOS: Bundle in App

Models in `assets/models/` are bundled by Metro as resource files.

If you encounter a "file not found" error, add the models folder to Xcode:
1. Open `ios/faceshieldedge.xcworkspace`
2. Right-click project → Add Files
3. Select `assets/models/`
4. Check "Copy items if needed" → Add
