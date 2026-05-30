/**
 * AttendanceQueue — Offline-first write queue
 *
 * Key schema (MMKV):
 *   attendance:{attendanceId}  → Encrypted AttendanceRecord JSON
 *   queue:pending              → JSON array of attendanceIds (ordered)
 *   queue:failed               → JSON array of attendanceIds that failed upload
 *
 * Local storage cap: 500 records. Auto-purges oldest beyond cap if
 * sync has been pending > 7 days (prevents storage bloat in extreme cases).
 */
import {storage} from './StorageInit';
import {STORAGE_KEYS, AttendanceRecord} from '../types';

const MAX_RECORDS = 500;
const MAX_PENDING_DAYS = 7;

export class AttendanceQueue {
  /**
   * Write a new attendance record to local storage and
   * append its ID to the pending queue.
   */
  static async enqueue(record: AttendanceRecord): Promise<void> {
    // Write the record
    const key = STORAGE_KEYS.attendance(record.attendanceId);
    storage.set(key, JSON.stringify(record));

    // Append to pending queue
    const pending = this.getPendingIds();
    pending.push(record.attendanceId);
    storage.set(STORAGE_KEYS.QUEUE_PENDING, JSON.stringify(pending));

    // Enforce storage cap
    if (pending.length > MAX_RECORDS) {
      this.enforceStorageCap(pending);
    }
  }

  /**
   * Dequeue a batch for upload (up to batchSize records).
   */
  static dequeueBatch(batchSize: number): AttendanceRecord[] {
    const pending = this.getPendingIds();
    const batch = pending.slice(0, batchSize);
    const records: AttendanceRecord[] = [];

    for (const id of batch) {
      const raw = storage.getString(STORAGE_KEYS.attendance(id));
      if (raw) {
        try {
          records.push(JSON.parse(raw) as AttendanceRecord);
        } catch {
          // Corrupted record — skip
        }
      }
    }
    return records;
  }

  /**
   * Purge confirmed records after server acknowledges upload.
   */
  static purgeConfirmed(confirmedIds: string[]): void {
    const confirmedSet = new Set(confirmedIds);

    // Delete individual records
    for (const id of confirmedIds) {
      storage.delete(STORAGE_KEYS.attendance(id));
    }

    // Update pending queue
    const remaining = this.getPendingIds().filter(id => !confirmedSet.has(id));
    storage.set(STORAGE_KEYS.QUEUE_PENDING, JSON.stringify(remaining));
  }

  /**
   * Move failed IDs to the failed queue for retry on next sync.
   */
  static moveToFailed(failedIds: string[]): void {
    const failed = this.getFailedIds();
    const merged = Array.from(new Set([...failed, ...failedIds]));
    storage.set(STORAGE_KEYS.QUEUE_FAILED, JSON.stringify(merged));

    // Remove from pending
    const failedSet = new Set(failedIds);
    const pending = this.getPendingIds().filter(id => !failedSet.has(id));
    storage.set(STORAGE_KEYS.QUEUE_PENDING, JSON.stringify(pending));
  }

  /**
   * Merge failed IDs back into pending for retry.
   */
  static retryFailed(): void {
    const failed = this.getFailedIds();
    if (failed.length === 0) return;

    const pending = this.getPendingIds();
    const merged = Array.from(new Set([...pending, ...failed]));
    storage.set(STORAGE_KEYS.QUEUE_PENDING, JSON.stringify(merged));
    storage.set(STORAGE_KEYS.QUEUE_FAILED, JSON.stringify([]));
  }

  static async getPendingCount(): Promise<number> {
    return this.getPendingIds().length;
  }

  static getPendingIds(): string[] {
    const raw = storage.getString(STORAGE_KEYS.QUEUE_PENDING);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; }
    catch { return []; }
  }

  static getFailedIds(): string[] {
    const raw = storage.getString(STORAGE_KEYS.QUEUE_FAILED);
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; }
    catch { return []; }
  }

  // ── Storage cap enforcement ──────────────────────────────────
  private static enforceStorageCap(pending: string[]): void {
    const cutoff = Date.now() - MAX_PENDING_DAYS * 86400 * 1000;
    const stale: string[] = [];

    for (const id of pending) {
      const raw = storage.getString(STORAGE_KEYS.attendance(id));
      if (!raw) { stale.push(id); continue; }
      try {
        const record = JSON.parse(raw) as AttendanceRecord;
        if (new Date(record.timestamp).getTime() < cutoff) {
          stale.push(id);
        }
      } catch {
        stale.push(id);
      }
    }

    if (stale.length > 0) {
      console.warn(`[AttendanceQueue] Auto-purging ${stale.length} stale records (>${MAX_PENDING_DAYS} days unsynced)`);
      this.purgeConfirmed(stale);
    }
  }
}
