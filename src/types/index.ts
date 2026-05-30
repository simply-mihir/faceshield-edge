// ─────────────────────────────────────────────────────────────
// FaceShield Edge — Shared TypeScript Types
// ─────────────────────────────────────────────────────────────

// ──────────── Liveness ────────────
export type LivenessChallenge =
  | 'blink'
  | 'smile'
  | 'head_left'
  | 'head_right'
  | 'brow_raise';

export type ChallengeStatus = 'waiting' | 'detected' | 'failed' | 'expired';

// ──────────── Auth ────────────
export type AuthStatus =
  | 'idle'
  | 'processing'
  | 'success'
  | 'rejected'
  | 'spoofing_detected'
  | 'timeout';

export type FailureReason =
  | 'spoof'
  | 'liveness_fail'
  | 'no_match'
  | 'timeout'
  | 'no_face'
  | 'multi_face';

// ──────────── Enrollment ────────────
export type EnrollmentStatus =
  | 'idle'
  | 'capturing'
  | 'processing'
  | 'complete'
  | 'error';

export type SyncStatus = 'synced' | 'pending_sync' | 'pending_enrollment' | 'failed';

// ──────────── Records ────────────
export interface AttendanceRecord {
  attendanceId: string;                // ATT-{date}-{employeeId}-{seq}
  employeeId: string;
  name: string;
  timestamp: string;                   // ISO 8601 with IST offset
  locationTag: string;
  livenessChallenge: LivenessChallenge;
  similarityScore: number;             // 0–1, not shown to user
  status: SyncStatus;
  hash: string;                        // SHA-256 tamper detection
}

export interface EmployeeRecord {
  employeeId: string;
  name: string;
  enrolledAt: string;
  embeddings: number[][];              // 5 × 128-dim L2-normalised vectors
  syncStatus: SyncStatus;
}

// ──────────── Hook Options ────────────
export interface FaceShieldOptions {
  employeeId: string;
  onSuccess: (record: AttendanceRecord) => void;
  onFailure: (reason: FailureReason) => void;
}

export interface FaceShieldEnrollmentOptions {
  onComplete: (employeeId: string, syncStatus: SyncStatus) => void;
  onError?: (error: string) => void;
}

// ──────────── Hook Return Types ────────────
export interface UseFaceShieldReturn {
  challenge: LivenessChallenge | null;
  challengeStatus: ChallengeStatus;
  authStatus: AuthStatus;
  similarity: number;
  startAuth: () => void;
  reset: () => void;
  isReady: boolean;
}

export interface UseFaceShieldEnrollmentReturn {
  captureProgress: number;             // 0–5
  enrollmentStatus: EnrollmentStatus;
  startEnrollment: (employeeId: string, name: string) => void;
  captureNext: () => void;
  reset: () => void;
}

export interface UseSyncStatusReturn {
  pendingCount: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
  triggerSync: () => void;
}

// ──────────── Anti-Spoofing ────────────
export interface AntiSpoofResult {
  passed: boolean;
  reason?: 'moire' | 'entropy' | 'spectral';
  score?: number;
}

// ──────────── Landmark Metrics ────────────
export interface FaceLandmarks {
  ear: number;                         // Eye Aspect Ratio
  mcr: number;                         // Mouth Corner Ratio
  bri: number;                         // Brow Raise Index
  yaw: number;                         // Head pose yaw in degrees
  pitch: number;
  roll: number;
}

// ──────────── Config ────────────
export interface FaceShieldConfig {
  similarityThreshold: number;         // default 0.68
  livenessTimeoutSeconds: number;      // default 8
  maxAuthAttempts: number;             // default 3
  lockoutDurationSeconds: number;      // default 60
  syncBatchSize: number;               // default 50
  offlinePeerSync: boolean;            // default false
  awsApiEndpoint: string;
  awsRegion: string;
}

export const DEFAULT_CONFIG: FaceShieldConfig = {
  similarityThreshold: 0.68,
  livenessTimeoutSeconds: 8,
  maxAuthAttempts: 3,
  lockoutDurationSeconds: 60,
  syncBatchSize: 50,
  offlinePeerSync: false,
  awsApiEndpoint: '',
  awsRegion: 'ap-south-1',
};

// ──────────── TFLite ────────────
export interface TFLiteModelPaths {
  blazeFace: string;
  mobileFaceNet: string;
  faceMesh: string;
}

// ──────────── Frame Processing ────────────
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceDetectionResult {
  detected: boolean;
  boundingBox: BoundingBox | null;
  confidence: number;
}

// ──────────── Sync ────────────
export interface SyncBatchPayload {
  deviceId: string;
  records: AttendanceRecord[];
  batchTimestamp: string;
}

export interface SyncBatchResponse {
  confirmedIds: string[];
  failedIds: string[];
  serverTimestamp: string;
}

// ──────────── Storage Keys ────────────
export const STORAGE_KEYS = {
  embedding: (employeeId: string) => `embeddings:${employeeId}`,
  attendance: (attendanceId: string) => `attendance:${attendanceId}`,
  QUEUE_PENDING: 'queue:pending',
  QUEUE_FAILED: 'queue:failed',
  CONFIG_THRESHOLD: 'config:threshold',
  CONFIG_VERSION: 'config:enrollmentVersion',
  DEVICE_ID: 'config:deviceId',
  LAST_SYNC: 'config:lastSyncAt',
} as const;
