/**
 * FaceShield Edge — Public API
 * Datalake 3.0 imports from this file only.
 */
export {useFaceShield} from './hooks/useFaceShield';
export {useFaceShieldEnrollment} from './hooks/useFaceShieldEnrollment';
export {useSyncStatus} from './hooks/useSyncStatus';
export {initStorage} from './services/StorageInit';
export {ConfigStore} from './services/ConfigStore';
export {EmbeddingStore} from './services/EmbeddingStore';
export {SyncService} from './services/SyncService';
export type {
  AttendanceRecord,
  EmployeeRecord,
  FaceShieldConfig,
  FaceShieldOptions,
  FaceShieldEnrollmentOptions,
  LivenessChallenge,
  AuthStatus,
  EnrollmentStatus,
  SyncStatus,
  FailureReason,
  UseFaceShieldReturn,
  UseFaceShieldEnrollmentReturn,
  UseSyncStatusReturn,
} from './types';
export {DEFAULT_CONFIG} from './types';
