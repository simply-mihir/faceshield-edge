# FaceShield Edge — Model Training Guide

Complete walkthrough for training and deploying the MobileFaceNet India model.

---

## Prerequisites

- Python 3.10+
- CUDA 11.8 / cuDNN 8.6 (GPU recommended; CPU works but Step 2 will be slow)
- ~50 GB free disk space (VGGFace2 is ~36 GB)
- VGGFace2 dataset access: https://www.robots.ox.ac.uk/~vgg/data/vgg_face2/

### Install dependencies

```bash
cd training/
pip install -r requirements.txt
```

---

## Step 1 — Prepare Dataset

Filters VGGFace2 for South Asian identities and applies field-condition augmentations.

```bash
python 01_prepare_dataset.py \
    --vgg_dir /data/vggface2 \
    --out_dir /data/faceshield_india \
    --target_identities 10000 \
    --augment_factor 5 \
    --seed 42
```

| Argument | Default | Description |
|---|---|---|
| `--vgg_dir` | — | VGGFace2 root (contains `data/` and `meta/` subdirs) |
| `--out_dir` | `/data/faceshield_india` | Output ImageFolder-structured directory |
| `--target_identities` | 10000 | Number of identities to include |
| `--augment_factor` | 5 | Augmented copies per original image |

**Expected output:**
```
Found 3,847 South Asian identities in metadata
Supplemented to 10,000 identities (South Asian + random)
Dataset ready: 10,000 identities, ~2,500,000 images
```

**Augmentations applied:**
- Harsh sunlight / low-light / golden-hour colour casts
- Shadow regions simulating partial occlusion
- Motion blur, Gaussian noise (handheld phone conditions)
- JPEG compression artefacts (low-end cameras)
- Horizontal flip, ±15° rotation

---

## Step 2 — Knowledge Distillation Training

Trains MobileFaceNet (student) to mimic ArcFace/ResNet-50 (teacher).

```bash
python 02_distillation_train.py \
    --data_dir /data/faceshield_india \
    --teacher_weights /models/arcface_resnet50.h5 \
    --output_dir /models/faceshield_student \
    --epochs 30 \
    --batch_size 64 \
    --lambda1 0.5 \
    --lambda2 0.5
```

| Argument | Default | Description |
|---|---|---|
| `--data_dir` | — | Prepared dataset from Step 1 |
| `--teacher_weights` | None | Optional pre-trained ArcFace weights |
| `--output_dir` | `/models/faceshield_student` | Checkpoint directory |
| `--epochs` | 30 | Training epochs |
| `--batch_size` | 64 | Batch size (reduce to 32 if OOM) |
| `--lambda1` | 0.5 | Weight for classification (ArcFace) loss |
| `--lambda2` | 0.5 | Weight for embedding alignment (MSE) loss |

**Loss function:**
```
L = 0.5 × ArcFace_CE_loss + 0.5 × MSE(teacher_embedding, student_embedding)
```

**Architecture:** MobileNetV2 (alpha=0.35) + depthwise conv head + L2 normalisation → 128-dim embedding

**Checkpoints saved to:**
- `student_best.h5` — best validation alignment loss
- `student_final.h5` — last epoch

**Estimated training time:**
- GPU (A100): ~4 hours
- GPU (V100): ~8 hours
- CPU only: ~48 hours (not recommended for full dataset)

---

## Step 3 — INT8 Quantisation

Converts the Keras model to INT8 TFLite (75% size reduction, 2–3× inference speedup via NNAPI).

```bash
python 03_quantise_tflite.py \
    --model_path /models/faceshield_student/student_best.h5 \
    --data_dir /data/faceshield_india \
    --output_path assets/models/mobilefacenet_india_int8.tflite
```

| Argument | Default | Description |
|---|---|---|
| `--model_path` | — | Trained `.h5` Keras model from Step 2 |
| `--data_dir` | — | Dataset for representative calibration (200 samples used) |
| `--output_path` | `assets/models/mobilefacenet_india_int8.tflite` | Output TFLite path |

**Expected output:**
```
✅ Quantised model saved: assets/models/mobilefacenet_india_int8.tflite
   Size: 1.4 MB
   Embedding shape: [1, 128]  (expected [1, 128])
   Embedding norm:  0.9997    (expected ~1.0)
✅ Model size 1.4MB — within 15MB target (spec: <20MB)
```

The output model goes in `assets/models/` and is bundled into the React Native app via metro.config.js `assetExts`.

---

## Step 4 — Threshold Calibration

Runs ROC analysis on a held-out validation set to find the EER and validate the default 0.68 threshold.

```bash
python 04_calibrate_threshold.py \
    --model_path assets/models/mobilefacenet_india_int8.tflite \
    --val_dir /data/faceshield_india_val \
    --output_dir calibration_results \
    --recommended_threshold 0.68
```

| Argument | Default | Description |
|---|---|---|
| `--model_path` | — | INT8 TFLite model from Step 3 |
| `--val_dir` | — | Held-out validation set (same ImageFolder structure) |
| `--output_dir` | `calibration_results/` | Where to save results |
| `--recommended_threshold` | 0.68 | Operating point to evaluate |

**Outputs:**
- `calibration_results/roc_curve.png` — ROC curve + FPR/FNR trade-off plot
- `calibration_results/threshold_report.json` — AUC, EER, threshold metrics

**Expected metrics for a well-trained model:**
| Metric | Target |
|---|---|
| AUC | > 0.98 |
| EER | < 3% |
| TPR @ 0.68 | > 97% |
| FPR @ 0.68 | < 1% |

---

## Deploying to Mobile App

After Step 3, copy the TFLite model to the assets directory:

```bash
# From project root
cp training/assets/models/mobilefacenet_india_int8.tflite \
   assets/models/mobilefacenet_india_int8.tflite
```

The app already references this path in `src/modules/TFLiteRunner.ts`:
```typescript
mobileFaceNet: require('../../assets/models/mobilefacenet_india_int8.tflite'),
```

For iOS, run `npx pod-install` after adding the new model file so Xcode picks it up.

---

## Model Size Budget

| Model | Format | Size | Purpose |
|---|---|---|---|
| BlazeFace | INT8 TFLite | ~0.5 MB | Face detection (128×128 input) |
| MediaPipe Face Mesh | INT8 TFLite | ~5.0 MB | 468-landmark extraction |
| MobileFaceNet India | INT8 TFLite | ~1.4 MB | 128-dim embedding |
| **Total** | | **~6.9 MB** | Well within 20 MB spec |

---

## Troubleshooting

**`OOM during distillation training`**
→ Reduce `--batch_size` to 32 or 16.

**`Embedding norm ≠ ~1.0 after quantisation`**
→ Ensure `inference_output_type = tf.float32` in Step 3 (float output preserves L2 norm).

**`AUC < 0.95 in calibration`**
→ The teacher model likely needs pre-trained ArcFace weights. Provide `--teacher_weights` pointing to a trained ResNet-50 ArcFace checkpoint (available from InsightFace model zoo).

**`No South Asian identities found in metadata`**
→ VGGFace2 `identity_meta.csv` may not include nationality. The script falls back to random sampling — this is expected. The augmentation pipeline compensates for demographic diversity.
