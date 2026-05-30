/**
 * EmbeddingStore — Encrypted employee embedding storage
 *
 * Key schema:
 *   embeddings:{employeeId}  → JSON EmployeeRecord (encrypted by MMKV layer)
 *
 * Raw face images are NEVER written here — only 128-dim embeddings.
 * AES-256-GCM encryption is handled by the MMKV encryption key layer.
 *
 * Storage cap: 500 employee records (well within field deployment needs).
 */
import {storage} from './StorageInit';
import {STORAGE_KEYS, EmployeeRecord, SyncStatus} from '../types';
import {SyncService} from './SyncService';

export class EmbeddingStore {
  /**
   * Store or update an employee record (embeddings + metadata).
   * Returns the syncStatus after attempting immediate upload.
   */
  static async storeEmployee(record: EmployeeRecord): Promise<SyncStatus> {
    const key = STORAGE_KEYS.embedding(record.employeeId);
    storage.set(key, JSON.stringify(record));

    // Append to enrollment sync queue
    const pending: string[] = this.getEnrollmentQueue();
    if (!pending.includes(record.employeeId)) {
      pending.push(record.employeeId);
      storage.set('queue:enrollment_pending', JSON.stringify(pending));
    }

    // Try immediate sync if online
    const synced = await SyncService.getInstance().syncEnrollments();
    return synced ? 'synced' : 'pending_enrollment';
  }

  /**
   * Retrieve decrypted embeddings for a single employee.
   */
  static async getEmbeddings(employeeId: string): Promise<number[][] | null> {
    const record = this.getEmployee(employeeId);
    return record?.embeddings ?? null;
  }

  /**
   * Synchronous employee record read.
   */
  static getEmployee(employeeId: string): EmployeeRecord | null {
    const key = STORAGE_KEYS.embedding(employeeId);
    const raw = storage.getString(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as EmployeeRecord;
    } catch {
      return null;
    }
  }

  /**
   * List all enrolled employee IDs (for admin UI).
   */
  static getAllEmployeeIds(): string[] {
    // MMKV doesn't support key enumeration natively; we maintain an index
    const index = storage.getString('index:employees');
    if (!index) return [];
    return JSON.parse(index) as string[];
  }

  /**
   * Update syncStatus for a specific employee after successful server upload.
   */
  static markSynced(employeeId: string): void {
    const record = this.getEmployee(employeeId);
    if (!record) return;
    record.syncStatus = 'synced';
    storage.set(STORAGE_KEYS.embedding(employeeId), JSON.stringify(record));

    // Remove from enrollment queue
    const pending = this.getEnrollmentQueue().filter(id => id !== employeeId);
    storage.set('queue:enrollment_pending', JSON.stringify(pending));
  }

  /**
   * Delete an employee record (admin operation only).
   */
  static deleteEmployee(employeeId: string): void {
    storage.delete(STORAGE_KEYS.embedding(employeeId));
    const ids = this.getAllEmployeeIds().filter(id => id !== employeeId);
    storage.set('index:employees', JSON.stringify(ids));
  }

  private static getEnrollmentQueue(): string[] {
    const raw = storage.getString('queue:enrollment_pending');
    if (!raw) return [];
    return JSON.parse(raw);
  }
}
