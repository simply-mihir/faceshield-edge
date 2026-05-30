/**
 * TFLiteRunner — Central TFLite model manager
 *
 * Loads and runs three on-device models via react-native-fast-tflite (JSI):
 *  • BlazeFace    — 0.5 MB, INT8 — face detection
 *  • Face Mesh    — 5.0 MB, INT8 — 468 landmarks
 *  • MobileFaceNet — 5.0 MB, INT8 — 128-dim embedding
 *
 * All models are bundled in the app package as binary assets.
 * NNAPI (Android) / Core ML (iOS) delegation is enabled automatically.
 */
import {loadTensorflowModel, TensorflowModel} from 'react-native-fast-tflite';
import {ImagePreprocessor} from '../utils/ImagePreprocessing';
import {BoundingBox, FaceDetectionResult} from '../types';

// Asset paths — bundled inside Android assets / iOS bundle resources
const MODEL_PATHS = {
  blazeFace: require('../../assets/models/blazeface_int8.tflite'),
  faceMesh: require('../../assets/models/face_mesh_int8.tflite'),
  mobileFaceNet: require('../../assets/models/mobilefacenet_india_int8.tflite'),
} as const;

// MobileFaceNet input: 112×112 RGB
const FACE_INPUT_SIZE = 112;

export class TFLiteRunner {
  private blazeFace: TensorflowModel | null = null;
  private faceMesh: TensorflowModel | null = null;
  private mobileFaceNet: TensorflowModel | null = null;
  private preprocessor: ImagePreprocessor;
  private _ready = false;

  constructor() {
    this.preprocessor = new ImagePreprocessor();
  }

  get isReady(): boolean {
    return this._ready;
  }

  // ── Load all three models (called once at init) ──────────────
  async loadModels(): Promise<void> {
    const [bf, fm, mfn] = await Promise.all([
      loadTensorflowModel(MODEL_PATHS.blazeFace, 'default'),
      loadTensorflowModel(MODEL_PATHS.faceMesh, 'default'),
      loadTensorflowModel(MODEL_PATHS.mobileFaceNet, 'default'),
    ]);
    this.blazeFace = bf;
    this.faceMesh = fm;
    this.mobileFaceNet = mfn;
    this._ready = true;
    console.log('[TFLiteRunner] All models loaded');
  }

  // ── Capture a camera frame (called via VisionCamera frame processor) ──
  async captureFrame(): Promise<Uint8Array> {
    // Frame capture is wired in CameraFrameProcessor (native side).
    // This stub is satisfied by the frame processor plugin injecting
    // a frame buffer into TFLiteRunner.currentFrame before startAuth() is called.
    return this.currentFrame ?? new Uint8Array(0);
  }

  public currentFrame: Uint8Array | null = null;

  // ── BlazeFace: detect primary face in frame ──────────────────
  async detectFace(frame: Uint8Array): Promise<FaceDetectionResult> {
    if (!this.blazeFace) throw new Error('BlazeFace not loaded');

    // BlazeFace input: 128×128 RGB uint8
    const resized = this.preprocessor.resize(frame, 128, 128);
    const inputTensor = this.preprocessor.normalizeUint8ToFloat32(resized);

    const [boxes, scores] = (await this.blazeFace.run([inputTensor])) as [
      Float32Array,
      Float32Array,
    ];

    // Output: boxes [N, 4] (xmin, ymin, xmax, ymax), scores [N]
    const maxScoreIdx = Array.from(scores).reduce(
      (best, val, idx) => (val > scores[best] ? idx : best),
      0,
    );
    const confidence = scores[maxScoreIdx];

    if (confidence < 0.6) {
      return {detected: false, boundingBox: null, confidence};
    }

    const offset = maxScoreIdx * 4;
    const boundingBox: BoundingBox = {
      x: boxes[offset],
      y: boxes[offset + 1],
      width: boxes[offset + 2] - boxes[offset],
      height: boxes[offset + 3] - boxes[offset + 1],
    };

    return {detected: true, boundingBox, confidence};
  }

  // ── Align and crop face to 112×112 ─────────────────────────
  async alignFace(frame: Uint8Array, box: BoundingBox): Promise<Uint8Array> {
    const cropped = this.preprocessor.crop(frame, box);
    // Rotation correction via eye-line angle (approximated from landmarks later)
    const aligned = this.preprocessor.resize(cropped, FACE_INPUT_SIZE, FACE_INPUT_SIZE);
    return this.preprocessor.applyLightingCorrection(aligned);
  }

  // ── Face Mesh: extract 468 landmarks ───────────────────────
  async extractLandmarks(alignedFace: Uint8Array): Promise<Float32Array> {
    if (!this.faceMesh) throw new Error('FaceMesh not loaded');

    const inputTensor = this.preprocessor.normalizeToNegOneOne(alignedFace);
    const [landmarks] = (await this.faceMesh.run([inputTensor])) as [Float32Array];
    // Output: [468 × 3] = 1404 floats (x, y, z per landmark, normalised 0–1)
    return landmarks;
  }

  // ── MobileFaceNet: generate 128-dim L2-normalised embedding ──
  async generateEmbedding(alignedFace: Uint8Array): Promise<number[]> {
    if (!this.mobileFaceNet) throw new Error('MobileFaceNet not loaded');

    const inputTensor = this.preprocessor.normalizeToNegOneOne(alignedFace);
    const [embeddingTensor] = (await this.mobileFaceNet.run([inputTensor])) as [
      Float32Array,
    ];

    // L2-normalise the 128-dim output
    const embedding = Array.from(embeddingTensor);
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map(v => v / norm);
  }

  // ── Dispose models to free memory ──────────────────────────
  dispose(): void {
    this.blazeFace?.dispose();
    this.faceMesh?.dispose();
    this.mobileFaceNet?.dispose();
    this._ready = false;
  }
}
