# FaceShield Edge v2.0

> **Hackathon 7.0 Submission** — Fully offline, privacy-first facial recognition + liveness detection for field attendance in India.

[![CI](https://github.com/simply-mihir/faceshield-edge/actions/workflows/ci.yml/badge.svg)](https://github.com/simply-mihir/faceshield-edge/actions)
[![Tests](https://img.shields.io/badge/tests-20%20passing-brightgreen)]()
[![Model Size](https://img.shields.io/badge/model%20size-~11%20MB-blue)]()
[![Platform](https://img.shields.io/badge/platform-Android%208%2B%20%7C%20iOS%2013%2B-lightgrey)]()

---

## What It Does

FaceShield Edge enables construction-site supervisors and field workers to clock attendance using only their face — **zero network required**. Records sync automatically when connectivity returns, with cryptographic tamper detection on every entry.

**Key capabilities:**
- Fully offline facial recognition on Android and iOS
- Two-tier anti-spoofing: passive Moiré FFT + active liveness challenge
- 5-challenge randomised liveness (blink, smile, head left/right, brow raise)
- AES-256 encrypted local storage with hardware-backed keys (Keystore / Secure Enclave)
- Background sync to AWS DynamoDB with exponential backoff retry
- Zero raw biometrics transmitted to cloud (embedding hash only in S3 audit)
- Knowledge distillation: ArcFace/ResNet-50 teacher → MobileFaceNet student

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/simply-mihir/faceshield-edge.git
cd faceshield-edge

# 2. Install JS dependencies
npm install

# 3. Download ML models (BlazeFace + Face Mesh from MediaPipe CDN)
bash scripts/download_models.sh

# 4. Android setup (downloads Gradle wrapper jar)
bash scripts/setup_android.sh

# 5. Configure environment
cp .env.example .env
# Edit .env: set AWS_API_ENDPOINT, DEVICE_SECRET

# 6. Run on Android
npx react-native run-android

# 7. Run on iOS
npx pod-install
npx react-native run-ios
```

---

## Run Tests

```bash
npm install
npm test
```

Expected:
```
PASS __tests__/CosineSimilarity.test.ts   (9 tests)
PASS __tests__/AttendanceQueue.test.ts    (6 tests)
PASS __tests__/LivenessEngine.test.ts     (5 tests)

Test Suites: 3 passed   Tests: 20 passed
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Native App (TS)                     │
│  VisionCamera v3 → Frame Processor (JSI, 15 fps)            │
│       │                                                      │
│       ▼                                                      │
│  Native Buffer (Kotlin / Obj-C++) ──► TFLiteRunner           │
│       │                ┌─────────────────────┤              │
│       │                ▼         ▼            ▼             │
│       │           BlazeFace  FaceMesh   MobileFaceNet        │
│       │           (detect)  (468 pts)   India INT8          │
│       │                                      │              │
│       ▼                                      ▼              │
│  AntiSpoof Engine              CosineSimilarity (0.68)      │
│  Moiré FFT | entropy | spectral ← stored embeddings (MMKV)  │
│       │                                      │              │
│       ▼                                      ▼              │
│  LivenessEngine (EAR/MCR/Yaw/BRI)   AttendanceRecord        │
│                                      + SHA-256 hash         │
│                                             │               │
│                                      AttendanceQueue        │
│                                      (MMKV, 500 cap)        │
│                                             │               │
│                                      SyncService            │
│                                      (NetInfo trigger)      │
└─────────────────────────────────────────────────────────────┘
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
| Face Detection | BlazeFace INT8 | 128×128 uint8 | Bounding box | 0.5 MB |
| Landmark Extraction | MediaPipe Face Mesh | 192×192 float | 468×3 landmarks | 5.0 MB |
| Face Recognition | MobileFaceNet India INT8 | 112×112 uint8 | 128-dim embedding | ~5.0 MB |
| Anti-spoofing | C++ FFT + entropy | Face ROI | Pass/reject | < 0.1 MB |
| **Total** | | | | **~11 MB** |

All models run on-device via `react-native-fast-tflite` (JSI — no bridge overhead). Android uses NNAPI delegation; iOS uses CoreML delegation.

---

## Anti-Spoofing

### Passive (every frame — Tier 1)

| Check | Threshold | Rejects |
|---|---|---|
| Moiré FFT score | > 0.6 | Printed photo replay |
| Frame entropy delta | < 0.015 | Static image / video loop |
| Spectral ratio R/(G+B) | < 0.28 | Screen replay (blue cast) |

### Active Liveness Challenge (Tier 2)

One random challenge per session — impossible to pre-stage:

| Challenge | Metric | Threshold |
|---|---|---|
| Blink | Eye Aspect Ratio (EAR) | < 0.20 for ≥2 frames |
| Smile | Mouth Corner Ratio (MCR) | > 1.35 |
| Head left / right | Yaw estimate | < −15° / > +15° |
| Brow raise | Brow Rise Index (BRI) | > 0.18 |

Timeout: 8 seconds. Max 3 attempts before 60-second lockout.

---

## Security

- **MMKV** (react-native-mmkv) — AES-256 encrypted key-value store
- **Key management** — Generated via `SecureRandom` / `SecRandomCopyBytes`, stored in Android Keystore / iOS Secure Enclave via `react-native-keychain`
- **Tamper detection** — SHA-256 hash on every record: `sha256(attendanceId + employeeId + timestamp + similarityScore + DEVICE_SECRET)`
- **Queue cap** — 500 records max; records older than 7 days auto-purged
- **No raw embeddings in cloud** — Only SHA-256 hash written to S3

---

## Offline Sync

```
MMKV queue → NetInfo detects connectivity
    → Batch 50 records → AWS API Gateway (JWT auth)
    → Lambda verifies SHA-256 → DynamoDB BatchWriteItem
    → purgeConfirmed() removes local records
    → Failed: exponential backoff (2s × 2^retry, max 5 retries)
```

---

## Performance

Target device: **Redmi Note 11 (Snapdragon 680, 4 GB RAM)** — representative Indian field device.

| Operation | Target Latency | Notes |
|---|---|---|
| Face detection (BlazeFace) | 20–30 ms | INT8 + NNAPI |
| Anti-spoofing pre-screen | 10–15 ms | Native C++/Kotlin |
| Face Mesh landmarks | 40–50 ms | INT8 TFLite |
| MobileFaceNet embedding | 100–120 ms | INT8 + NNAPI |
| Cosine similarity (5 embeddings) | < 5 ms | Pure JS |
| **End-to-end auth pipeline** | **< 400 ms** | Well under 1s target |

*Benchmarks are design targets based on published INT8 TFLite performance on Snapdragon 680. Measure on your device with `react-native-performance` or Android Profiler.*

---

## Project Structure

```
faceshield-edge/
├── src/
│   ├── hooks/           useFaceShield, useFaceShieldEnrollment, useSyncStatus
│   ├── modules/         TFLiteRunner, CameraFrameProcessor, AntiSpoofing
│   ├── services/        StorageInit, AttendanceQueue, SyncService, EmbeddingStore
│   ├── utils/           LivenessEngine, CosineSimilarity, RecordFactory
│   ├── screens/         Attendance, Enrollment, Home, Admin, Permissions
│   ├── store/           Zustand attendanceStore
│   └── types/           All shared TypeScript types
├── android/             Kotlin native modules (8 files)
│   └── app/src/main/java/com/faceshieldedge/
│       ├── FaceShieldCryptoModule.kt
│       ├── FaceShieldAntiSpoofModule.kt
│       ├── FaceShieldPreprocessModule.kt
│       ├── FaceShieldFrameProcessorPlugin.kt
│       └── FaceShieldPackage.kt (+3 more)
├── ios/                 Objective-C++ native modules (5 files)
│   ├── FaceShieldCrypto.mm
│   ├── FaceShieldAntiSpoof.mm
│   ├── FaceShieldPreprocess.mm
│   ├── FaceShieldFrameProcessorPlugin.mm
│   └── FaceShieldFrameBufferModule.mm
├── aws/                 SAM template + Lambda functions
├── training/            Python distillation pipeline (4 scripts)
├── __tests__/           20 unit tests
├── scripts/             Model download + Android setup
└── docs/                Integration guide + model setup
```

---

## Training Your Own Model

See [`training/TRAINING_GUIDE.md`](training/TRAINING_GUIDE.md) for the full 4-step pipeline:

1. **Dataset prep** — VGGFace2 South Asian filter + field-condition augmentations
2. **Knowledge distillation** — ArcFace/ResNet-50 teacher → MobileFaceNet student
3. **INT8 quantisation** — 75% size reduction, 2–3× speedup via NNAPI
4. **Threshold calibration** — ROC/EER analysis on held-out Indian demographic validation set

---

## Datalake 3.0 Integration

See [`docs/INTEGRATION_GUIDE.md`](docs/INTEGRATION_GUIDE.md).

One hook, no architecture changes required:

```tsx
import {useFaceShield} from './src/hooks/useFaceShield';

const {challenge, authStatus, startAuth} = useFaceShield({
  employeeId: currentUser.id,
  onSuccess: (record) => attendanceStore.addRecord(record),
  onFailure: (reason) => showToast(reason),
});
```

---

## Deploy AWS Backend

```bash
cd aws/
sam build
sam deploy --guided \
  --stack-name faceshield-edge \
  --region ap-south-1 \
  --capabilities CAPABILITY_IAM
```

---

## Hackathon Compliance

| Requirement | Status |
|---|---|
| Fully offline facial recognition | ✅ |
| Active liveness (5 challenges) | ✅ |
| Anti-spoofing (passive + active) | ✅ |
| React Native / Datalake 3.0 compatible | ✅ |
| TFLite on-device inference | ✅ |
| AES-256 encrypted local storage | ✅ |
| Hardware-backed key storage | ✅ |
| SHA-256 tamper detection | ✅ |
| Offline queue + auto-sync | ✅ |
| AWS SAM backend | ✅ |
| No raw biometrics in cloud | ✅ |
| Model size < 15 MB | ✅ (~11 MB) |
| Configurable similarity threshold | ✅ (0.60–0.80) |
| Knowledge distillation training pipeline | ✅ |
| Unit tests | ✅ (20 tests, 3 suites) |
| CI pipeline (GitHub Actions) | ✅ |

---

## CI/CD

GitHub Actions runs on every push: lint + type-check → unit tests → Lambda syntax check → Android assembleDebug (on PR).

---

## License

MIT © FaceShield Edge Team — Hackathon 7.0
