/**
 * useFaceShieldEnrollment — 5-image enrollment hook
 *
 * Captures 5 images at defined poses, generates embeddings for each,
 * stores them encrypted in MMKV, and queues for AWS sync.
 *
 * Works completely offline — syncStatus will be "pending_sync" if
 * network is unavailable at enrollment time.
 *
 * Used by: Datalake 3.0 AdminEnrollmentScreen
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  EnrollmentStatus,
  FaceShieldEnrollmentOptions,
  SyncStatus,
  UseFaceShieldEnrollmentReturn,
} from '../types';
import {TFLiteRunner} from '../modules/TFLiteRunner';
import {EmbeddingStore} from '../services/EmbeddingStore';
import {SyncService} from '../services/SyncService';

// 5 capture poses per the spec
const CAPTURE_PROMPTS = [
  'Look straight ahead, neutral expression',
  'Turn head slightly left (~15°)',
  'Turn head slightly right (~15°)',
  'Look straight ahead, smile naturally',
  'Look straight ahead, neutral expression (repeat)',
];

export function useFaceShieldEnrollment(
  options: FaceShieldEnrollmentOptions,
): UseFaceShieldEnrollmentReturn {
  const {onComplete, onError} = options;

  const [captureProgress, setCaptureProgress] = useState(0);   // 0–5
  const [enrollmentStatus, setEnrollmentStatus] = useState<EnrollmentStatus>('idle');

  const tfliteRef = useRef<TFLiteRunner | null>(null);
  const embeddingsRef = useRef<number[][]>([]);
  const employeeIdRef = useRef<string>('');
  const nameRef = useRef<string>('');

  // ── Load models ─────────────────────────────────────────────
  useEffect(() => {
    tfliteRef.current = new TFLiteRunner();
    tfliteRef.current.loadModels().catch(err =>
      console.error('[Enrollment] Model load error:', err),
    );
    return () => tfliteRef.current?.dispose();
  }, []);

  // ── Start enrollment session ─────────────────────────────────
  const startEnrollment = useCallback((employeeId: string, name: string) => {
    employeeIdRef.current = employeeId;
    nameRef.current = name;
    embeddingsRef.current = [];
    setCaptureProgress(0);
    setEnrollmentStatus('capturing');
  }, []);

  // ── Capture next image ───────────────────────────────────────
  const captureNext = useCallback(async () => {
    if (!tfliteRef.current) return;
    if (captureProgress >= 5) return;
    if (enrollmentStatus !== 'capturing') return;

    try {
      // 1. Grab frame
      const frame = await tfliteRef.current.captureFrame();

      // 2. Detect + align face
      const detection = await tfliteRef.current.detectFace(frame);
      if (!detection.detected || !detection.boundingBox) {
        onError?.('No face detected. Please adjust position.');
        return;
      }

      const aligned = await tfliteRef.current.alignFace(frame, detection.boundingBox);

      // 3. Generate embedding — raw image is NOT stored
      const embedding = await tfliteRef.current.generateEmbedding(aligned);
      embeddingsRef.current.push(embedding);

      const newProgress = captureProgress + 1;
      setCaptureProgress(newProgress);

      // 4. All 5 captures done → finalise
      if (newProgress === 5) {
        setEnrollmentStatus('processing');
        await finaliseEnrollment();
      }
    } catch (err) {
      console.error('[Enrollment] Capture error:', err);
      onError?.('Capture failed. Please try again.');
    }
  }, [captureProgress, enrollmentStatus, onError]);

  // ── Finalise: encrypt + store + queue ───────────────────────
  const finaliseEnrollment = async () => {
    try {
      const syncStatus = await EmbeddingStore.storeEmployee({
        employeeId: employeeIdRef.current,
        name: nameRef.current,
        enrolledAt: new Date().toISOString(),
        embeddings: embeddingsRef.current,
        syncStatus: 'pending_enrollment',
      });

      // Kick off background sync if online
      SyncService.getInstance().syncEnrollments();

      setEnrollmentStatus('complete');
      onComplete(employeeIdRef.current, syncStatus);
    } catch (err) {
      console.error('[Enrollment] Finalise error:', err);
      setEnrollmentStatus('error');
      onError?.('Enrollment storage failed.');
    }
  };

  const reset = useCallback(() => {
    embeddingsRef.current = [];
    employeeIdRef.current = '';
    nameRef.current = '';
    setCaptureProgress(0);
    setEnrollmentStatus('idle');
  }, []);

  return {
    captureProgress,
    enrollmentStatus,
    startEnrollment,
    captureNext,
    reset,
  };
}

export {CAPTURE_PROMPTS};
