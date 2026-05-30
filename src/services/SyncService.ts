/**
 * SyncService — NetInfo-triggered offline-to-AWS sync service
 *
 * Runs as a singleton background service.
 * Listens to NetInfo connectivity changes and triggers sync when
 * the device comes online.
 *
 * Upload flow:
 *  1. Decrypt pending records from MMKV
 *  2. Batch upload to AWS API Gateway (max 50 per batch)
 *  3. Server validates SHA-256 hash per record
 *  4. Server returns confirmed IDs
 *  5. Purge confirmed records locally
 *  6. Move failures to failed queue (retry with exponential backoff)
 *  7. Emit events for useSyncStatus hook
 */
import NetInfo, {NetInfoState} from '@react-native-community/netinfo';
import {EventEmitter} from 'events';
import {AttendanceQueue} from './AttendanceQueue';
import {EmbeddingStore} from './EmbeddingStore';
import {ConfigStore} from './ConfigStore';
import {storage} from './StorageInit';
import {STORAGE_KEYS, SyncBatchPayload, SyncBatchResponse, EmployeeRecord} from '../types';

const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 2000;
const DEVICE_ID_KEY = STORAGE_KEYS.DEVICE_ID;

export class SyncService extends EventEmitter {
  private static instance: SyncService;
  private _isSyncing = false;
  private _retryCount = 0;
  private _unsubscribeNetInfo?: () => void;

  private constructor() {
    super();
  }

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  // ── Start listening for connectivity ─────────────────────────
  startListening(): void {
    this._unsubscribeNetInfo = NetInfo.addEventListener(
      (state: NetInfoState) => {
        if (state.isConnected && state.isInternetReachable) {
          this.syncAttendance();
          this.syncEnrollments();
        }
      },
    );
  }

  stopListening(): void {
    this._unsubscribeNetInfo?.();
  }

  // ── Sync attendance records ──────────────────────────────────
  async syncAttendance(): Promise<boolean> {
    if (this._isSyncing) return false;

    const cfg = ConfigStore.getConfig();
    if (!cfg.awsApiEndpoint) return false;

    // Merge failed into pending for retry
    AttendanceQueue.retryFailed();

    const pendingCount = await AttendanceQueue.getPendingCount();
    if (pendingCount === 0) return true;

    this._isSyncing = true;
    this.emit('sync:start');

    try {
      const batch = AttendanceQueue.dequeueBatch(cfg.syncBatchSize);
      const deviceId = this.getDeviceId();

      const payload: SyncBatchPayload = {
        deviceId,
        records: batch,
        batchTimestamp: new Date().toISOString(),
      };

      const jwt = storage.getString('auth:jwt') ?? '';
      const response = await fetch(`${cfg.awsApiEndpoint}/attendance/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result: SyncBatchResponse = await response.json();
      AttendanceQueue.purgeConfirmed(result.confirmedIds);
      AttendanceQueue.moveToFailed(result.failedIds);

      this._retryCount = 0;
      this.emit('sync:complete', result.confirmedIds.length);
      return true;
    } catch (err) {
      console.error('[SyncService] Attendance sync failed:', err);
      this._retryCount++;
      const backoff = BASE_BACKOFF_MS * Math.pow(2, Math.min(this._retryCount, MAX_RETRIES));
      setTimeout(() => this.syncAttendance(), backoff);
      return false;
    } finally {
      this._isSyncing = false;
    }
  }

  // ── Sync pending enrollments ─────────────────────────────────
  async syncEnrollments(): Promise<boolean> {
    const cfg = ConfigStore.getConfig();
    if (!cfg.awsApiEndpoint) return false;

    const pendingIds: string[] = (() => {
      const raw = storage.getString('queue:enrollment_pending');
      if (!raw) return [];
      return JSON.parse(raw) as string[];
    })();

    if (pendingIds.length === 0) return true;

    const jwt = storage.getString('auth:jwt') ?? '';

    let allSucceeded = true;
    for (const employeeId of pendingIds) {
      const record = EmbeddingStore.getEmployee(employeeId);
      if (!record) continue;

      try {
        const res = await fetch(`${cfg.awsApiEndpoint}/enrollment/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify(record),
        });

        if (res.ok) {
          EmbeddingStore.markSynced(employeeId);
        } else {
          allSucceeded = false;
        }
      } catch {
        allSucceeded = false;
      }
    }

    return allSucceeded;
  }

  // ── Device ID (stable per-install identifier) ───────────────
  private getDeviceId(): string {
    let id = storage.getString(DEVICE_ID_KEY);
    if (!id) {
      id = `DEV-${Date.now()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
      storage.set(DEVICE_ID_KEY, id);
    }
    return id;
  }
}
