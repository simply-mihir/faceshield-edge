/**
 * CameraFrameProcessor — VisionCamera v3 frame processor worklet
 *
 * This is the JS glue between the camera feed and TFLiteRunner.
 *
 * How it works:
 *  1. VisionCamera calls the frame processor on every camera frame (60fps)
 *  2. We call the native `faceShieldProcessFrame` plugin which:
 *     - Converts the frame from YUV/BGRA → RGBA
 *     - Stores it in FaceShieldFrameBuffer (native singleton)
 *  3. TFLiteRunner.captureFrame() reads from that native buffer
 *     when startAuth() triggers inference
 *
 * The frame processor runs on the camera thread (not JS thread),
 * so it uses the 'worklet' pragma for VisionCamera v3 JSI execution.
 *
 * Usage (in AttendanceScreen):
 *   const frameProcessor = useCameraFrameProcessor(tfliteRunner);
 *   <Camera frameProcessor={frameProcessor} ... />
 */
import {useCallback} from 'react';
import {useFrameProcessor} from 'react-native-vision-camera';
import {runAsync} from 'react-native-vision-camera';
import {TFLiteRunner} from './TFLiteRunner';

// Native plugin (registered via VISION_EXPORT_FRAME_PROCESSOR on iOS /
// FrameProcessorPluginRegistry on Android)
const faceShieldProcessFrame =
  require('react-native-vision-camera').VisionCameraProxy.initFrameProcessorPlugin(
    'faceShieldProcessFrame',
    {},
  );

/**
 * Returns a VisionCamera frameProcessor that feeds frames into TFLiteRunner.
 * Call this hook once in AttendanceScreen / EnrollmentScreen.
 */
export function useCameraFrameProcessor(runner: TFLiteRunner | null) {
  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!faceShieldProcessFrame) return;

      // Run async so we don't block the camera thread on heavy processing
      runAsync(frame, () => {
        'worklet';
        const result = faceShieldProcessFrame(frame);
        // result = { frameReady: true, width, height }
        // The native plugin has already written the RGBA bytes to the
        // shared buffer; TFLiteRunner reads from there on demand.
      });
    },
    [runner],
  );

  return frameProcessor;
}

/**
 * Standalone hook that reads the current frame from the native buffer.
 * Used by TFLiteRunner.captureFrame() to grab the latest RGBA bytes.
 *
 * On Android: reads FaceShieldFrameProcessorPlugin.currentFrameRGBA
 * On iOS:     reads FaceShieldFrameBuffer.shared.currentFrame
 * Both exposed via NativeModules.FaceShieldFrameBuffer.
 */
import {NativeModules} from 'react-native';
const {FaceShieldFrameBuffer} = NativeModules;

export async function captureCurrentFrame(): Promise<Uint8Array> {
  const bytes: number[] = await FaceShieldFrameBuffer.getCurrentFrame();
  return new Uint8Array(bytes);
}
