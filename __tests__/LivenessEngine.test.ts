/**
 * Unit tests — LivenessEngine.computeMetrics()
 *
 * Tests landmark metric computation with synthetic landmark arrays.
 * No native modules, camera, or TFLite required.
 */
import {LivenessEngine} from '../src/utils/LivenessEngine';

// Build a 468 × 3 landmark array (1404 floats) filled with a default value
function makeLandmarks(defaults: Record<number, [number, number, number]> = {}): Float32Array {
  const arr = new Float32Array(468 * 3);
  // Default: all landmarks at centre
  for (let i = 0; i < 468; i++) {
    arr[i * 3]     = 0.5;
    arr[i * 3 + 1] = 0.5;
    arr[i * 3 + 2] = 0.0;
  }
  for (const [idx, [x, y, z]] of Object.entries(defaults)) {
    const i = Number(idx);
    arr[i * 3]     = x;
    arr[i * 3 + 1] = y;
    arr[i * 3 + 2] = z;
  }
  return arr;
}

describe('LivenessEngine.computeMetrics', () => {
  const engine = new LivenessEngine();

  it('returns numeric values for all metrics', () => {
    const lm = makeLandmarks();
    const metrics = engine.computeMetrics(lm);
    expect(typeof metrics.ear).toBe('number');
    expect(typeof metrics.mcr).toBe('number');
    expect(typeof metrics.yaw).toBe('number');
    expect(typeof metrics.bri).toBe('number');
  });

  it('EAR < 0.20 when eye is closed (vertical landmarks collapsed)', () => {
    // Left eye indices: [362, 385, 387, 263, 373, 380]
    // Collapse vertical landmarks (p2,p3 = same y as p5,p6) → EAR near 0
    const closed = makeLandmarks({
      362: [0.3, 0.5, 0],  // outer corner
      385: [0.35, 0.5, 0], // top — same y as bottom → eye closed
      387: [0.4, 0.5, 0],
      263: [0.5, 0.5, 0],  // inner corner
      373: [0.4, 0.5, 0],  // bottom
      380: [0.35, 0.5, 0],
      // Right eye
      33:  [0.3, 0.5, 0],
      160: [0.35, 0.5, 0],
      158: [0.4, 0.5, 0],
      133: [0.5, 0.5, 0],
      153: [0.4, 0.5, 0],
      144: [0.35, 0.5, 0],
    });
    const metrics = engine.computeMetrics(closed);
    expect(metrics.ear).toBeLessThan(0.20);
  });

  it('EAR >= 0.20 when eye is open', () => {
    // Spread vertical landmarks far apart → large EAR
    const open = makeLandmarks({
      362: [0.3, 0.5, 0],
      385: [0.35, 0.3, 0], // top high
      387: [0.4,  0.3, 0],
      263: [0.5,  0.5, 0],
      373: [0.4,  0.7, 0], // bottom low
      380: [0.35, 0.7, 0],
      33:  [0.3,  0.5, 0],
      160: [0.35, 0.3, 0],
      158: [0.4,  0.3, 0],
      133: [0.5,  0.5, 0],
      153: [0.4,  0.7, 0],
      144: [0.35, 0.7, 0],
    });
    const metrics = engine.computeMetrics(open);
    expect(metrics.ear).toBeGreaterThanOrEqual(0.20);
  });

  it('yaw is negative when nose is to the left of midpoint (head turned left)', () => {
    // Nose tip (idx 1) x < midpoint of ears (234, 454)
    const turnedLeft = makeLandmarks({
      1:   [0.3, 0.5, 0], // nose tip — left of centre
      234: [0.2, 0.5, 0], // left ear
      454: [0.8, 0.5, 0], // right ear
    });
    const metrics = engine.computeMetrics(turnedLeft);
    expect(metrics.yaw).toBeLessThan(0);
  });

  it('yaw is positive when nose is to the right (head turned right)', () => {
    const turnedRight = makeLandmarks({
      1:   [0.7, 0.5, 0],
      234: [0.2, 0.5, 0],
      454: [0.8, 0.5, 0],
    });
    const metrics = engine.computeMetrics(turnedRight);
    expect(metrics.yaw).toBeGreaterThan(0);
  });
});
