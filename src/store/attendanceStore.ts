/**
 * attendanceStore — Zustand store for in-session attendance state
 *
 * Mirrors the Datalake 3.0 attendance store pattern.
 * Persists nothing here — MMKV via AttendanceQueue is the source of truth.
 * This store is UI state only (current session records for display).
 *
 * Datalake 3.0 integration:
 *   import {useAttendanceStore} from 'react-native-faceshield-edge'
 *   useAttendanceStore.getState().addRecord(record)
 */
import {create} from 'zustand';
import {AttendanceRecord} from '../types';
import {AttendanceQueue} from '../services/AttendanceQueue';

interface AttendanceState {
  // Today's session records (in-memory, for UI display)
  sessionRecords: AttendanceRecord[];
  // Whether the sync service is running
  isSyncing: boolean;
  // Last known pending count from MMKV queue
  pendingCount: number;

  // Actions
  addRecord: (record: AttendanceRecord) => void;
  setIsSyncing: (val: boolean) => void;
  setPendingCount: (count: number) => void;
  clearSession: () => void;
  loadPendingCount: () => Promise<void>;
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  sessionRecords: [],
  isSyncing: false,
  pendingCount: 0,

  addRecord: (record: AttendanceRecord) => {
    set(state => ({
      sessionRecords: [record, ...state.sessionRecords],
      pendingCount: state.pendingCount + 1,
    }));
  },

  setIsSyncing: (val: boolean) => set({isSyncing: val}),

  setPendingCount: (count: number) => set({pendingCount: count}),

  clearSession: () => set({sessionRecords: []}),

  loadPendingCount: async () => {
    const count = await AttendanceQueue.getPendingCount();
    set({pendingCount: count});
  },
}));
