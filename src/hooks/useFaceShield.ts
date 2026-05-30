/**
 * useFaceShield — Primary authentication hook
 *
 * Orchestrates the full pipeline:
 * Face Detection → Anti-Spoofing → Alignment → Liveness → Recognition → Record
 *
 * Used by: Datalake 3.0 AttendanceScreen
 */
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AuthStatus,
  ChallengeStatus,
  FaceShieldOptions,
  FailureReason,
  LivenessChallenge,
  UseFaceShieldReturn,
} from '../types';
import {TFLiteRunner} from '../modules/TFLiteRunner';
import {AntiSpoofingEngine} from '../modules/AntiSpoofing';
import {LivenessEngine} from '../utils/LivenessEngine';
import {CosineSimilarity} from '../utils/CosineSimilarity';
import {EmbeddingStore} from '../services/EmbeddingStore';
import {AttendanceQueue} from '../services/AttendanceQueue';
import {ConfigStore} from '../services/ConfigStore';
import {generateAttendanceRecord} from '../utils/RecordFactory';

const CHALLENGE_SET: LivenessChallenge[] = [
  'blink',
  'smile',
  'head_left',
  'head_right',
  'brow_raise',
];

function pickChallenge(usedChallenges: LivenessChallenge[]): LivenessChallenge {
  const available = CHALLENGE_SET.filter(c => !usedChallenges.includes(c));
  const pool = available.length > 0 ? available : CHALLENGE_SET;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function useFaceShield(options: FaceShieldOptions): UseFaceShieldReturn {
  const {employeeId, onSuccess, onFailure} = options;

  const [authStatus, setAuthStatus] = useState<AuthStatus>('idle');
  const [challenge, setChallenge] = useState<LivenessChallenge | null>(null);
  const [challengeStatus, setChallengeStatus] = useState<ChallengeStatus>('waiting');
  const [similarity, setSimilarity] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const tfliteRef = useRef<TFLiteRunner | null>(null);
  const antiSpoofRef = useRef<AntiSpoofingEngine | null>(null);
  const livenessRef = useRef<LivenessEngine | null>(null);
  const attemptsRef = useRef(0);
  const usedChallengesRef = useRef<LivenessChallenge[]>([]);
  const challengeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Initialise models on mount ──────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      tfliteRef.current = new TFLiteRunner();
      antiSpoofRef.current = new AntiSpoofingEngine();
      livenessRef.current = new LivenessEngine();

      await tfliteRef.current.loadModels();
      if (mounted) setIsReady(true);
    })();
    return () => {
      mounted = false;
      tfliteRef.current?.dispose();
      clearChallengTimer();
      if (lockoutTimerRef.current) clearTimeout(lockoutTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearChallengTimer = () => {
    if (challengeTimerRef.current) {
      clearTimeout(challengeTimerRef.current);
      challengeTimerRef.current = null;
    }
  };

  // ── Issue new liveness challenge ────────────────────────────
  const issueChallenge = useCallback(() => {
    const cfg = ConfigStore.getConfig();
    const next = pickChallenge(usedChallengesRef.current);
    usedChallengesRef.current.push(next);
    setChallenge(next);
    setChallengeStatus('waiting');

    clearChallengTimer();
    challengeTimerRef.current = setTimeout(() => {
      setChallengeStatus('expired');
      // Re-issue a different challenge automatically
      issueChallenge();
    }, cfg.livenessTimeoutSeconds * 1000);
  }, []);

  // ── Main authentication flow ────────────────────────────────
  const startAuth = useCallback(async () => {
    if (!isReady || !tfliteRef.current || !livenessRef.current) return;
    if (authStatus === 'processing') return;

    const cfg = ConfigStore.getConfig();

    // Check lockout
    if (attemptsRef.current >= cfg.maxAuthAttempts) {
      setAuthStatus('rejected');
      onFailure('timeout');
      return;
    }

    setAuthStatus('processing');
    usedChallengesRef.current = [];
    issueChallenge();

    try {
      // ── Step 1: Capture frame from Vision Camera ──────────
      const frame = await tfliteRef.current.captureFrame();

      // ── Step 2: Anti-spoofing pre-screen ──────────────────
      const spoofResult = await antiSpoofRef.current!.analyze(frame);
      if (!spoofResult.passed) {
        setAuthStatus('spoofing_detected');
        onFailure('spoof');
        return;
      }

      // ── Step 3: Face detection ─────────────────────────────
      const detection = await tfliteRef.current.detectFace(frame);
      if (!detection.detected || !detection.boundingBox) {
        setAuthStatus('rejected');
        onFailure('no_face');
        return;
      }

      // ── Step 4: Aligned face crop ──────────────────────────
      const alignedFace = await tfliteRef.current.alignFace(
        frame,
        detection.boundingBox,
      );

      // ── Step 5: Liveness challenge loop ───────────────────
      const livenessOk = await livenessRef.current.runChallenge(
        challenge!,
        tfliteRef.current,
        cfg.livenessTimeoutSeconds,
        status => setChallengeStatus(status),
      );

      if (!livenessOk) {
        attemptsRef.current += 1;
        setAuthStatus('rejected');
        onFailure('liveness_fail');
        clearChallengTimer();
        return;
      }

      setChallengeStatus('detected');
      clearChallengTimer();

      // ── Step 6: MobileFaceNet embedding ───────────────────
      const embedding = await tfliteRef.current.generateEmbedding(alignedFace);

      // ── Step 7: Identity matching ─────────────────────────
      const storedEmbeddings = await EmbeddingStore.getEmbeddings(employeeId);
      if (!storedEmbeddings || storedEmbeddings.length === 0) {
        setAuthStatus('rejected');
        onFailure('no_match');
        return;
      }

      const maxSimilarity = CosineSimilarity.matchAgainstSet(
        embedding,
        storedEmbeddings,
      );
      setSimilarity(maxSimilarity);

      // ── Step 8: Decision ──────────────────────────────────
      if (maxSimilarity >= cfg.similarityThreshold) {
        const employee = await EmbeddingStore.getEmployee(employeeId);
        const record = generateAttendanceRecord({
          employeeId,
          name: employee?.name ?? 'Unknown',
          challenge: challenge!,
          similarityScore: maxSimilarity,
        });

        await AttendanceQueue.enqueue(record);
        attemptsRef.current = 0;
        setAuthStatus('success');
        onSuccess(record);
      } else {
        attemptsRef.current += 1;
        setAuthStatus('rejected');
        onFailure('no_match');

        // Lockout after max attempts
        if (attemptsRef.current >= cfg.maxAuthAttempts) {
          lockoutTimerRef.current = setTimeout(() => {
            attemptsRef.current = 0;
            setAuthStatus('idle');
          }, cfg.lockoutDurationSeconds * 1000);
        }
      }
    } catch (err) {
      console.error('[FaceShield] Auth error:', err);
      setAuthStatus('rejected');
      onFailure('timeout');
    }
  }, [isReady, authStatus, challenge, employeeId, onSuccess, onFailure, issueChallenge]);

  // ── Reset ───────────────────────────────────────────────────
  const reset = useCallback(() => {
    clearChallengTimer();
    setAuthStatus('idle');
    setChallenge(null);
    setChallengeStatus('waiting');
    setSimilarity(0);
    usedChallengesRef.current = [];
  }, []);

  return {
    challenge,
    challengeStatus,
    authStatus,
    similarity,
    startAuth,
    reset,
    isReady,
  };
}
