# FaceShield Edge v2.0

> **Hackathon 7.0 Submission** — Fully offline, privacy-first facial recognition + liveness detection for field attendance in India.

[![CI](https://github.com/YOUR_USERNAME/faceshield-edge/actions/workflows/ci.yml/badge.svg)](https://github.com/YOUR_USERNAME/faceshield-edge/actions)

---

## What It Does

FaceShield Edge enables construction-site supervisors and field workers to clock attendance using only their face — no network required. Records sync automatically when connectivity returns, with cryptographic tamper detection on every entry.

**Key capabilities:**

- Fully offline facial recognition on Android and iOS
- Two-factor anti-spoofing (passive passive Moiré + active liveness challenge)
- AES-256 encrypted local storage with hardware-backed keys
- Background sync to AWS DynamoDB with exponential backoff retry
- Zero raw biometrics transmitted to cloud (embedding hash only in S3 audit)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App (TS)                     │
│                                                              │
│  VisionCamera v3 → Frame Processor (JSI, 15 fps)            │
│       │                                                      │
│       ▼                                                      │
│  Native Buffer (Kotlin / Obj-C++) ──► TFLiteRunner           │
│       │                              │                       │
│       │         ┌────────────────────┤                       │
│       │         ▼         ▼          ▼                       │
│       │    BlazeFace  FaceMesh  MobileFaceNet                │
│       │    (detect)  (468 pts)  India INT8                   │
│       │                              │                       │
│       ▼                              ▼                       │
│  AntiSpoof Engine          CosineSimilarity (0.68)          │
│  (Moiré FFT, entropy,      ← stored embeddings (MMKV)       │
│   spectral ratio)                    │                       │
│       │                              ▼                       │
│       ▼                     AttendanceRecord + SHA-256 hash  │
│  LivenessEngine                      │                       │
│  (EAR, MCR, Yaw, BRI)               ▼                       │
│                              AttendanceQueue (MMKV, 500 cap) │
│                                      │                       │
│                              SyncService (NetInfo)           │
│                                      │                       │
└──────────────────────────────────────┼──────────────────────┘
                                       │ (when online)
                                       ▼
                            AWS API Gateway → Lambda
                                       │
                            DynamoDB (attendance log)
                            S3 (SHA-256 audit, no raw data)
```

---

## On-Device ML Pipeline

| Stage | Model | Input | Output | Size |
|---|---|---|---|---|
| Face Detection | BlazeFace INT8 | 128×128 uint8 | Bounding box + confidence | 0.5 MB |
| Landmark Extraction | MediaPipe Face Mesh INT8 | 192×192 float | 468×3 landmarks | 5.0 MB |
| Face Recognition | MobileFaceNet India INT8 | 112×112 uint8 | 128-dim embedding | 1.4 MB |
| **Total** | | | | **6.9 MB** |

All three models run on-device via `react-native-fast-tflite` (JSI — no bridge overhead). Android uses NNAPI delegation; iOS uses CoreML delegation for GPU acceleration.

---

## Anti-Spoofing

### Passive (every frame)

| Check | Threshold | Rejects |
|---|---|---|
| Moiré FFT score | > 0.6 | Printed photo replay |
| Frame entropy delta | < 0.015 | Static image / video loop |
| Spectral ratio R/(G+B) | < 0.28 | Screen replay (blue cast) |

### Active Liveness Challenge

One random challenge from: **blink · smile · head_left · head_right · brow_raise**

| Challenge | Metric | Threshold |
|---|---|---|
| Blink | Eye Aspect Ratio (EAR) | < 0.20 |
| Smile | Mouth Corner Ratio (MCR) | > 1.35 |
| Head left / right | Yaw estimate | < −15° / > +15° |
| Brow raise | Brow Rise Index (BRI) | > 0.18 |

Timeout: 8 seconds (configurable). Max 3 attempts before 60-second lockout.

---

## Storage & Security

- **MMKV** (react-native-mmkv) — synchronous key-value store with AES-256 encryption
- **Encryption key** — generated via `SecureRandom` (Android) / `SecRandomCopyBytes` (iOS), stored in Android Keystore / iOS Secure Enclave via `react-native-keychain`
- **Tamper detection** — every `AttendanceRecord` carries a SHA-256 hash of `attendanceId + employeeId + timestamp + similarityScore + DEVICE_SECRET`
- **Queue cap** — 500 records maximum; records older than 7 days auto-purged
- **No raw embeddings in cloud** — only the embedding SHA-256 hash is written to S3 for audit

---

## Offline Sync

```
MMKV queue → SyncService.startListening()
    → NetInfo detects connectivity
    → Batch 50 records → AWS API Gateway (JWT auth)
    → Lambda verifies SHA-256 hash → DynamoDB BatchWriteItem
    → purgeConfirmed() removes from local queue
    → Failed: exponential backoff (2s × 2^retry, max 5 attempts)
```

---

## Project Structure

```
faceshield-edge/
├── src/
│   ├── hooks/
│   │   ├── useFaceShield.ts          # Main auth pipeline hook
│   │   ├── useFaceShieldEnrollment.ts # 5-image enrollment
│   │   └── useSyncStatus.ts          # Sync event subscriptions
│   ├── modules/
│   │   ├── TFLiteRunner.ts           # BlazeFace + FaceMesh + MobileFaceNet
│   │   ├── CameraFrameProcessor.ts   # VisionCamera frame processor
│   │   └── AntiSpoofing.ts           # Moiré + entropy + spectral checks
│   ├── services/
│   │   ├── StorageInit.ts            # MMKV boot-time init + key management
│   │   ├── SyncService.ts            # Offline queue sync
│   │   └── AttendanceQueue.ts        # MMKV queue with 500 cap + 7-day purge
│   ├── utils/
│   │   ├── LivenessEngine.ts         # MediaPipe landmark → liveness metrics
│   │   └── CosineSimilarity.ts       # L2-normalised cosine matching
│   ├── screens/
│   │   ├── AttendanceScreen.tsx      # Main camera UI
│   │   ├── PermissionsScreen.tsx     # Camera permission gate
│   │   ├── EnrollmentScreen.tsx      # Employee face enrollment
│   │   ├── HomeScreen.tsx            # Dashboard
│   │   └── AdminScreen.tsx           # Config + threshold management
│   ├── store/
│   │   └── attendanceStore.ts        # Zustand state
│   └── types/
│       └── index.ts                  # All shared types
├── android/
│   └── app/src/main/java/.../        # Kotlin native modules
│       ├── FaceShieldCryptoModule    # AES-256, SHA-256
│       ├── FaceShieldAntiSpoofModule # Moiré FFT, entropy, spectral
│       ├── FaceShieldPreprocessModule # Crop, resize, CLAHE
│       └── FaceShieldFrameProcessorPlugin # YUV→RGBA + VisionCamera plugin
├── ios/
│   └── faceshieldedge/              # Obj-C++ native modules (mirrors Android)
├── aws/
│   ├── template.yaml                # SAM: API GW + Lambda + DynamoDB + S3
│   └── lambda/
│       ├── attendance/index.js       # Hash verify + DynamoDB batch write
│       └── enrollment/index.js       # Embedding store + S3 audit hash
├── training/
│   ├── 01_prepare_dataset.py         # VGGFace2 filter + augmentation
│   ├── 02_distillation_train.py      # ArcFace teacher → MobileFaceNet student
│   ├── 03_quantise_tflite.py         # INT8 TFLite conversion
│   ├── 04_calibrate_threshold.py     # ROC + EER threshold calibration
│   └── TRAINING_GUIDE.md
├── __tests__/
│   ├── CosineSimilarity.test.ts
│   ├── LivenessEngine.test.ts
│   └── AttendanceQueue.test.ts
├── assets/models/                    # TFLite model files (not in git)
└── docs/
    ├── MODEL_SETUP.md
    └── INTEGRATION_GUIDE.md
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/faceshield-edge.git
cd faceshield-edge
npm install
npx pod-install           # iOS only
```

### 2. Download ML models

```bash
bash scripts/download_models.sh
# Downloads BlazeFace + FaceMesh from MediaPipe CDN
# Place your trained MobileFaceNet INT8 model at:
# assets/models/mobilefacenet_india_int8.tflite
```

### 3. Configure environment

```bash
cp .env.example .env
# Fill in: AWS_API_ENDPOINT, AWS_REGION, LOCATION_TAG, DEVICE_SECRET
```

### 4. Run

```bash
# Android
npx react-native run-android

# iOS
npx react-native run-ios
```

### 5. Deploy AWS backend

```bash
cd aws/
sam build
sam deploy --guided
```

---

## Performance Benchmarks

Tested on Redmi Note 11 (Snapdragon 680) — representative of Indian field devices.

| Operation | Latency | Notes |
|---|---|---|
| Face detection (BlazeFace) | ~12 ms | 128×128 INT8, NNAPI |
| Landmark extraction (FaceMesh) | ~28 ms | 192×192 INT8 |
| Embedding generation (MobileFaceNet) | ~18 ms | 112×112 INT8 |
| Anti-spoof (Moiré FFT) | ~8 ms | Native Kotlin FFT |
| Full auth pipeline | ~120 ms | Including liveness |
| Cold start (model load) | ~800 ms | Once at app launch |

---

## Training Your Own Model

See [`training/TRAINING_GUIDE.md`](training/TRAINING_GUIDE.md) for the full 4-step pipeline:

1. Prepare dataset (VGGFace2 + South Asian demographic filter)
2. Knowledge distillation training (ArcFace teacher → MobileFaceNet student)
3. INT8 quantisation (TFLite)
4. Threshold calibration (ROC / EER analysis)

---

## CI/CD

GitHub Actions runs on every push:

- **lint-typecheck** — ESLint + TypeScript strict
- **test** — Jest unit tests (CosineSimilarity, LivenessEngine, AttendanceQueue)
- **validate-lambda** — Node.js syntax check on Lambda functions
- **android-build** — Gradle assembleDebug

---

## Hackathon Compliance Checklist

| Requirement | Status |
|---|---|
| Fully offline facial recognition | ✅ |
| Active liveness detection | ✅ (5 challenges) |
| Anti-spoofing (passive) | ✅ (Moiré, entropy, spectral) |
| React Native (Datalake 3.0 compatible) | ✅ |
| TFLite on-device inference | ✅ |
| AES-256 encrypted local storage | ✅ |
| Hardware-backed key storage | ✅ (Keystore / Secure Enclave) |
| SHA-256 tamper detection | ✅ |
| Offline queue + auto-sync | ✅ |
| AWS SAM backend | ✅ |
| No raw biometrics in cloud | ✅ |
| Model size < 20 MB | ✅ (6.9 MB total) |
| Configurable similarity threshold | ✅ (0.60–0.80) |
| Unit tests | ✅ (3 suites, 19 tests) |
| CI pipeline | ✅ (GitHub Actions) |

---

## License

MIT © FaceShield Edge Team — Hackathon 7.0
