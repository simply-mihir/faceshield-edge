/**
 * RecordFactory — Tamper-evident attendance record generator
 *
 * Every record gets a SHA-256 hash computed from its content fields
 * plus a device secret. The server recomputes this on sync and flags
 * mismatches for manual review.
 */
import {NativeModules, Platform} from 'react-native';
import {AttendanceRecord, LivenessChallenge, SyncStatus} from '../types';
import {storage} from '../services/StorageInit';
import {STORAGE_KEYS} from '../types';

const {FaceShieldCrypto} = NativeModules;

interface RecordInput {
  employeeId: string;
  name: string;
  challenge: LivenessChallenge;
  similarityScore: number;
}

export function generateAttendanceRecord(input: RecordInput): AttendanceRecord {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = (storage.getNumber('seq:' + dateStr) ?? 0) + 1;
  storage.set('seq:' + dateStr, seq);

  const attendanceId = `ATT-${dateStr}-${input.employeeId}-${String(seq).padStart(3, '0')}`;
  const timestamp = now.toISOString();
  const locationTag = storage.getString('config:locationTag') ?? 'SITE-DEFAULT';
  const deviceSecret = storage.getString('config:deviceSecret') ?? 'NO_SECRET';

  // SHA-256 hash for tamper detection
  // Computed natively: sha256(attendanceId + employeeId + timestamp + similarityScore + deviceSecret)
  const hashInput = `${attendanceId}${input.employeeId}${timestamp}${input.similarityScore.toFixed(6)}${deviceSecret}`;
  const hash: string = FaceShieldCrypto.sha256Sync(hashInput);

  const record: AttendanceRecord = {
    attendanceId,
    employeeId: input.employeeId,
    name: input.name,
    timestamp,
    locationTag,
    livenessChallenge: input.challenge,
    similarityScore: input.similarityScore,
    status: 'pending_sync' as SyncStatus,
    hash,
  };

  return record;
}
