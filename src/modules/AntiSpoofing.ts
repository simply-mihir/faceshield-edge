/**
 * AntiSpoofingEngine — Two-tier spoof detection (JS layer)
 *
 * Tier 1 runs before any liveness challenge:
 *  A) Moiré pattern detection via 2D FFT frequency analysis
 *  B) Frame entropy analysis across 5-frame rolling window
 *  C) Screen spectral signature via RGB channel ratio
 *
 * The heavy FFT math is delegated to the native C++ module on Android
 * and Objective-C++ on iOS via NativeModules.FaceShieldAntiSpoof.
 * This JS class is the cross-platform orchestrator.
 */
import {NativeModules} from 'react-native';
import {AntiSpoofResult} from '../types';

const {FaceShieldAntiSpoof} = NativeModules;

// Thresholds as per spec
const MOIRE_THRESHOLD = 0.6;
const ENTROPY_DELTA_THRESHOLD = 0.015;
const SPECTRAL_RATIO_THRESHOLD = 0.28;
const ENTROPY_WINDOW_SIZE = 5;

export class AntiSpoofingEngine {
  private frameEntropyWindow: number[] = [];

  /**
   * Analyze a single frame for spoofing indicators.
   * Returns {passed: true} if all checks pass, otherwise
   * {passed: false, reason, score}.
   */
  async analyze(frame: Uint8Array): Promise<AntiSpoofResult> {
    // ── A. Moiré Pattern Detection ────────────────────────────
    // FFT executed natively for performance
    const moireScore: number = await FaceShieldAntiSpoof.computeMoireScore(
      Array.from(frame),
    );
    if (moireScore > MOIRE_THRESHOLD) {
      return {passed: false, reason: 'moire', score: moireScore};
    }

    // ── B. Frame Entropy Analysis ─────────────────────────────
    const entropy: number = await FaceShieldAntiSpoof.computeEntropy(
      Array.from(frame),
    );
    this.frameEntropyWindow.push(entropy);
    if (this.frameEntropyWindow.length > ENTROPY_WINDOW_SIZE) {
      this.frameEntropyWindow.shift();
    }

    if (this.frameEntropyWindow.length === ENTROPY_WINDOW_SIZE) {
      const deltas = this.frameEntropyWindow
        .slice(1)
        .map((e, i) => Math.abs(e - this.frameEntropyWindow[i]));
      const meanDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;

      if (meanDelta < ENTROPY_DELTA_THRESHOLD) {
        return {passed: false, reason: 'entropy', score: meanDelta};
      }
    }

    // ── C. Screen Spectral Signature ─────────────────────────
    // RGB channel means from face ROI
    const {r, g, b}: {r: number; g: number; b: number} =
      await FaceShieldAntiSpoof.computeSpectralRatio(Array.from(frame));
    const spectralRatio = r / (g + b + 1e-6); // avoid div-by-zero
    if (spectralRatio < SPECTRAL_RATIO_THRESHOLD) {
      return {passed: false, reason: 'spectral', score: spectralRatio};
    }

    return {passed: true};
  }

  reset(): void {
    this.frameEntropyWindow = [];
  }
}
