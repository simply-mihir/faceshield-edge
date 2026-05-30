/**
 * ImagePreprocessor — Outdoor lighting normalisation pipeline
 *
 * Pipeline (all in JS/TypeScript; heavy frame ops also available
 * via native FaceShieldPreprocess NativeModule):
 *
 *  1. Gamma correction   — auto γ from mean luminance
 *  2. CLAHE              — local contrast normalisation (native)
 *  3. White balance      — Grey World algorithm
 *  4. Resize             — bilinear to target size
 *  5. Pixel normalise    — [0,255] → [-1, 1] for MobileFaceNet
 *
 * Raw face images are NEVER stored after this pipeline runs.
 */
import {NativeModules} from 'react-native';
import {BoundingBox} from '../types';

const {FaceShieldPreprocess} = NativeModules;

export class ImagePreprocessor {
  /**
   * Crop a face region from a raw RGBA frame buffer.
   * Coordinates are normalised [0,1] from BlazeFace output.
   */
  crop(frame: Uint8Array, box: BoundingBox): Uint8Array {
    // Delegated to native for speed — returns cropped RGBA bytes
    const result: number[] = FaceShieldPreprocess.cropSync(
      Array.from(frame),
      box.x,
      box.y,
      box.width,
      box.height,
    );
    return new Uint8Array(result);
  }

  /**
   * Bilinear resize to targetW × targetH (RGBA).
   */
  resize(frame: Uint8Array, targetW: number, targetH: number): Uint8Array {
    const result: number[] = FaceShieldPreprocess.resizeSync(
      Array.from(frame),
      targetW,
      targetH,
    );
    return new Uint8Array(result);
  }

  /**
   * Full outdoor lighting correction:
   *  1. Gamma  2. CLAHE  3. White balance
   * Returns corrected RGBA bytes.
   */
  applyLightingCorrection(frame: Uint8Array): Uint8Array {
    const mean = this.computeMeanLuminance(frame);
    // γ < 1 brightens (dark conditions), γ > 1 darkens (overexposed)
    const gamma = mean < 100 ? 1.4 : mean > 180 ? 0.8 : 1.0;

    const gammaCorrected = this.applyGamma(frame, gamma);
    const clahed: number[] = FaceShieldPreprocess.applyCLAHE(
      Array.from(gammaCorrected),
      2.0,  // clip_limit
      8,    // tile_grid_size
    );
    const whiteBalanced = this.greyWorldWhiteBalance(new Uint8Array(clahed));
    return whiteBalanced;
  }

  /**
   * Normalise uint8 RGBA → float32 RGB [0, 1] for BlazeFace input.
   */
  normalizeUint8ToFloat32(frame: Uint8Array): Float32Array {
    const size = (frame.length / 4) * 3;
    const out = new Float32Array(size);
    let j = 0;
    for (let i = 0; i < frame.length; i += 4) {
      out[j++] = frame[i] / 255;       // R
      out[j++] = frame[i + 1] / 255;   // G
      out[j++] = frame[i + 2] / 255;   // B
      // Alpha channel dropped
    }
    return out;
  }

  /**
   * Normalise uint8 RGBA → float32 RGB [-1, 1] for MobileFaceNet / FaceMesh.
   */
  normalizeToNegOneOne(frame: Uint8Array): Float32Array {
    const size = (frame.length / 4) * 3;
    const out = new Float32Array(size);
    let j = 0;
    for (let i = 0; i < frame.length; i += 4) {
      out[j++] = (frame[i] / 127.5) - 1;
      out[j++] = (frame[i + 1] / 127.5) - 1;
      out[j++] = (frame[i + 2] / 127.5) - 1;
    }
    return out;
  }

  // ── Private helpers ─────────────────────────────────────────

  private computeMeanLuminance(frame: Uint8Array): number {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < frame.length; i += 4) {
      // BT.601 luminance: 0.299R + 0.587G + 0.114B
      sum += 0.299 * frame[i] + 0.587 * frame[i + 1] + 0.114 * frame[i + 2];
      count++;
    }
    return count > 0 ? sum / count : 128;
  }

  private applyGamma(frame: Uint8Array, gamma: number): Uint8Array {
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      lut[i] = Math.min(255, Math.round(Math.pow(i / 255, 1 / gamma) * 255));
    }
    const out = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i += 4) {
      out[i] = lut[frame[i]];
      out[i + 1] = lut[frame[i + 1]];
      out[i + 2] = lut[frame[i + 2]];
      out[i + 3] = frame[i + 3]; // preserve alpha
    }
    return out;
  }

  private greyWorldWhiteBalance(frame: Uint8Array): Uint8Array {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let i = 0; i < frame.length; i += 4) {
      rSum += frame[i]; gSum += frame[i + 1]; bSum += frame[i + 2];
      count++;
    }
    if (count === 0) return frame;
    const mean = (rSum + gSum + bSum) / (3 * count);
    const rScale = mean / (rSum / count);
    const gScale = mean / (gSum / count);
    const bScale = mean / (bSum / count);

    const out = new Uint8Array(frame.length);
    for (let i = 0; i < frame.length; i += 4) {
      out[i]     = Math.min(255, Math.round(frame[i]     * rScale));
      out[i + 1] = Math.min(255, Math.round(frame[i + 1] * gScale));
      out[i + 2] = Math.min(255, Math.round(frame[i + 2] * bScale));
      out[i + 3] = frame[i + 3];
    }
    return out;
  }
}
