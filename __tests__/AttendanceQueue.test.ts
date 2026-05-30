/**
 * Unit tests — AttendanceQueue
 * Mocks MMKV storage and validates queue operations.
 */

// Mock react-native-mmkv
const mockStorage: Record<string, string | number> = {};
jest.mock('react-native-mmkv', () => ({
  MMKV: jest.fn().mockImplementation(() => ({
    set: (key: string, val: string | number) => { mockStorage[key] = val; },
    getString: (key: string) => mockStorage[key] as string | undefined,
    getNumber: (key: string) => mockStorage[key] as number | undefined,
    delete: (key: string) => { delete mockStorage[key]; },
  })),
}));

// Mock StorageInit
jest.mock('../src/services/StorageInit', () => ({
  storage: {
    set: (key: string, val: string | number) => { mockStorage[key] = val; },
    getString: (key: string) => mockStorage[key] as string | undefined,
    getNumber: (key: string) => mockStorage[key] as number | undefined,
    delete: (key: string) => { delete mockStorage[key]; },
  },
}));

import {AttendanceQueue} from '../src/services/AttendanceQueue';
import {AttendanceRecord} from '../src/types';

const makeRecord = (id: string): AttendanceRecord => ({
  attendanceId: id,
  employeeId: 'EMP001',
  name: 'Test User',
  timestamp: new Date().toISOString(),
  locationTag: 'SITE-TEST',
  livenessChallenge: 'blink',
  similarityScore: 0.85,
  status: 'pending_sync',
  hash: 'abc123',
});

beforeEach(() => {
  Object.keys(mockStorage).forEach(k => delete mockStorage[k]);
});

describe('AttendanceQueue', () => {
  it('enqueues a record and retrieves it in pending list', async () => {
    const record = makeRecord('ATT-001');
    await AttendanceQueue.enqueue(record);
    const ids = AttendanceQueue.getPendingIds();
    expect(ids).toContain('ATT-001');
  });

  it('dequeueBatch returns correct records up to batch size', async () => {
    await AttendanceQueue.enqueue(makeRecord('ATT-001'));
    await AttendanceQueue.enqueue(makeRecord('ATT-002'));
    await AttendanceQueue.enqueue(makeRecord('ATT-003'));

    const batch = AttendanceQueue.dequeueBatch(2);
    expect(batch).toHaveLength(2);
    expect(batch[0].attendanceId).toBe('ATT-001');
  });

  it('purgeConfirmed removes records from storage and queue', async () => {
    await AttendanceQueue.enqueue(makeRecord('ATT-001'));
    await AttendanceQueue.enqueue(makeRecord('ATT-002'));

    AttendanceQueue.purgeConfirmed(['ATT-001']);

    const remaining = AttendanceQueue.getPendingIds();
    expect(remaining).not.toContain('ATT-001');
    expect(remaining).toContain('ATT-002');
    expect(mockStorage['attendance:ATT-001']).toBeUndefined();
  });

  it('moveToFailed moves IDs to failed queue', async () => {
    await AttendanceQueue.enqueue(makeRecord('ATT-001'));
    AttendanceQueue.moveToFailed(['ATT-001']);

    const pending = AttendanceQueue.getPendingIds();
    const failed  = AttendanceQueue.getFailedIds();
    expect(pending).not.toContain('ATT-001');
    expect(failed).toContain('ATT-001');
  });

  it('retryFailed merges failed IDs back into pending', async () => {
    await AttendanceQueue.enqueue(makeRecord('ATT-001'));
    AttendanceQueue.moveToFailed(['ATT-001']);
    AttendanceQueue.retryFailed();

    const pending = AttendanceQueue.getPendingIds();
    const failed  = AttendanceQueue.getFailedIds();
    expect(pending).toContain('ATT-001');
    expect(failed).toHaveLength(0);
  });

  it('getPendingCount returns correct count', async () => {
    await AttendanceQueue.enqueue(makeRecord('ATT-001'));
    await AttendanceQueue.enqueue(makeRecord('ATT-002'));
    const count = await AttendanceQueue.getPendingCount();
    expect(count).toBe(2);
  });
});
