/**
 * LivenessEngine — Active liveness challenge verifier
 *
 * Reads MediaPipe Face Mesh landmarks from TFLiteRunner and
 * computes per-challenge metrics:
 *
 *  Challenge     | Metric                  | Threshold
 *  blink         | Eye Aspect Ratio (EAR)  | EAR < 0.20 for ≥ 2 frames
 *  smile         | Mouth Corner Ratio(MCR) | MCR > 1.35
 *  head_left     | Head Pose Yaw           | Yaw < −15°
 *  head_right    | Head Pose Yaw           | Yaw > +15°
 *  brow_raise    | Brow Raise Index (BRI)  | BRI > 0.18
 *
 * Landmark indices follow MediaPipe Face Mesh canonical map.
 */
import {ChallengeStatus, FaceLandmarks, LivenessChallenge} from '../types';
import {TFLiteRunner} from '../modules/TFLiteRunner';

// ── MediaPipe Landmark Indices ────────────────────────────────
// Eye Aspect Ratio landmarks (6 per eye)
const LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144];

// Mouth corner landmarks
const MOUTH_LEFT = 61;
const MOUTH_RIGHT = 291;
const MOUTH_TOP = 0;
const MOUTH_BOTTOM = 17;

// Brow landmarks
const LEFT_BROW_TOP = 334;
const LEFT_BROW_BASE = 362;   // top of left eye
const RIGHT_BROW_TOP = 105;
const RIGHT_BROW_BASE = 33;   // top of right eye

// Head pose reference points
const NOSE_TIP = 1;
const LEFT_EAR = 234;
const RIGHT_EAR = 454;

// Thresholds
const EAR_BLINK_THRESHOLD = 0.20;
const EAR_BLINK_MIN_FRAMES = 2;
const MCR_SMILE_THRESHOLD = 1.35;
const YAW_TURN_THRESHOLD = 15; // degrees
const BRI_RAISE_THRESHOLD = 0.18;

// Polling config
const POLL_INTERVAL_MS = 50; // ~20 fps landmark analysis
const MAX_POLL_FRAMES = 200; // guard against runaway

type StatusCallback = (status: ChallengeStatus) => void;

export class LivenessEngine {
  /**
   * Run a challenge against live camera frames via TFLiteRunner.
   * Polls for up to timeoutSeconds, returning true if challenge detected.
   */
  async runChallenge(
    challenge: LivenessChallenge,
    runner: TFLiteRunner,
    timeoutSeconds: number,
    onStatusChange: StatusCallback,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutSeconds * 1000;
    let blinkFrameCount = 0;
    let frameCount = 0;

    onStatusChange('waiting');

    while (Date.now() < deadline && frameCount < MAX_POLL_FRAMES) {
      frameCount++;
      await sleep(POLL_INTERVAL_MS);

      // Grab fresh camera frame
      const frame = await runner.captureFrame();
      if (!frame || frame.length === 0) continue;

      // Detect face first
      const detection = await runner.detectFace(frame);
      if (!detection.detected || !detection.boundingBox) continue;

      const aligned = await runner.alignFace(frame, detection.boundingBox);

      // Extract landmarks
      let landmarks: Float32Array;
      try {
        landmarks = await runner.extractLandmarks(aligned);
      } catch {
        continue;
      }

      // Compute metrics
      const metrics = this.computeMetrics(landmarks);

      // Evaluate challenge
      switch (challenge) {
        case 'blink': {
          const avgEAR = (metrics.ear + metrics.ear) / 2; // both eyes averaged inside computeMetrics
          if (avgEAR < EAR_BLINK_THRESHOLD) {
            blinkFrameCount++;
            if (blinkFrameCount >= EAR_BLINK_MIN_FRAMES) {
              onStatusChange('detected');
              return true;
            }
          } else {
            blinkFrameCount = Math.max(0, blinkFrameCount - 1);
          }
          break;
        }
        case 'smile':
          if (metrics.mcr > MCR_SMILE_THRESHOLD) {
            onStatusChange('detected');
            return true;
          }
          break;
        case 'head_left':
          if (metrics.yaw < -YAW_TURN_THRESHOLD) {
            onStatusChange('detected');
            return true;
          }
          break;
        case 'head_right':
          if (metrics.yaw > YAW_TURN_THRESHOLD) {
            onStatusChange('detected');
            return true;
          }
          break;
        case 'brow_raise':
          if (metrics.bri > BRI_RAISE_THRESHOLD) {
            onStatusChange('detected');
            return true;
          }
          break;
      }
    }

    onStatusChange('failed');
    return false;
  }

  // ── Metric Computation ──────────────────────────────────────

  computeMetrics(landmarks: Float32Array): FaceLandmarks {
    const lm = (idx: number) => ({
      x: landmarks[idx * 3],
      y: landmarks[idx * 3 + 1],
      z: landmarks[idx * 3 + 2],
    });

    // Eye Aspect Ratio: EAR = (p2-p6 + p3-p5) / (2 * p1-p4)
    const earLeft = this.computeEAR(LEFT_EYE_INDICES.map(i => lm(i)));
    const earRight = this.computeEAR(RIGHT_EYE_INDICES.map(i => lm(i)));
    const ear = (earLeft + earRight) / 2;

    // Mouth Corner Ratio: MCR = horizontal_mouth / vertical_mouth
    const mouthW = dist(lm(MOUTH_LEFT), lm(MOUTH_RIGHT));
    const mouthH = dist(lm(MOUTH_TOP), lm(MOUTH_BOTTOM));
    const mcr = mouthW / (mouthH + 1e-6);

    // Head Pose Yaw (rough estimate from ear-to-nose ratios)
    const nosePt = lm(NOSE_TIP);
    const leftEarPt = lm(LEFT_EAR);
    const rightEarPt = lm(RIGHT_EAR);
    const midX = (leftEarPt.x + rightEarPt.x) / 2;
    const yaw = ((nosePt.x - midX) / (rightEarPt.x - leftEarPt.x + 1e-6)) * 90;

    // Brow Raise Index: BRI = mean(brow_top.y - brow_base.y)
    const lBRI = lm(LEFT_BROW_BASE).y - lm(LEFT_BROW_TOP).y;
    const rBRI = lm(RIGHT_BROW_BASE).y - lm(RIGHT_BROW_TOP).y;
    const bri = (lBRI + rBRI) / 2;

    return {ear, mcr, yaw, bri, pitch: 0, roll: 0};
  }

  private computeEAR(pts: {x: number; y: number; z: number}[]): number {
    // pts: [p1, p2, p3, p4, p5, p6] — outer corner, top×2, outer corner, bottom×2
    const vertical1 = dist(pts[1], pts[5]);
    const vertical2 = dist(pts[2], pts[4]);
    const horizontal = dist(pts[0], pts[3]);
    return (vertical1 + vertical2) / (2 * horizontal + 1e-6);
  }
}

// ── Helpers ────────────────────────────────────────────────────
function dist(
  a: {x: number; y: number},
  b: {x: number; y: number},
): number {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2));
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
