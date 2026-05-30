/**
 * useSyncStatus — Reactive sync status hook
 *
 * Subscribes to the SyncService event emitter so the Datalake 3.0
 * dashboard can display live pending count, last sync time, and
 * syncing spinner without polling.
 *
 * Used by: Datalake 3.0 Dashboard / any screen needing sync status
 */
import {useCallback, useEffect, useState} from 'react';
import {UseSyncStatusReturn} from '../types';
import {SyncService} from '../services/SyncService';
import {AttendanceQueue} from '../services/AttendanceQueue';
import {storage} from '../services/StorageInit';
import {STORAGE_KEYS} from '../types';

export function useSyncStatus(): UseSyncStatusReturn {
  const syncService = SyncService.getInstance();

  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load initial values
  useEffect(() => {
    (async () => {
      const count = await AttendanceQueue.getPendingCount();
      setPendingCount(count);

      const last = storage.getString(STORAGE_KEYS.LAST_SYNC);
      setLastSyncAt(last ?? null);
    })();
  }, []);

  // Subscribe to sync events
  useEffect(() => {
    const onStart = () => setIsSyncing(true);

    const onComplete = async (confirmedCount: number) => {
      setIsSyncing(false);
      const now = new Date().toISOString();
      setLastSyncAt(now);
      storage.set(STORAGE_KEYS.LAST_SYNC, now);

      const count = await AttendanceQueue.getPendingCount();
      setPendingCount(count);
    };

    const onQueued = async () => {
      const count = await AttendanceQueue.getPendingCount();
      setPendingCount(count);
    };

    syncService.on('sync:start', onStart);
    syncService.on('sync:complete', onComplete);
    syncService.on('queue:enqueued', onQueued);

    return () => {
      syncService.off('sync:start', onStart);
      syncService.off('sync:complete', onComplete);
      syncService.off('queue:enqueued', onQueued);
    };
  }, [syncService]);

  const triggerSync = useCallback(() => {
    syncService.syncAttendance();
  }, [syncService]);

  return {pendingCount, lastSyncAt, isSyncing, triggerSync};
}
