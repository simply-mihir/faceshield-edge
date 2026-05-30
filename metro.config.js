/**
 * Metro config — FaceShield Edge
 *
 * Key additions:
 *  1. assetExts includes 'tflite' and 'task' so Metro bundles TFLite model files
 *  2. resolver.assetExts prevents Metro from treating model files as source
 */
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    // Add TFLite model extensions to asset list
    assetExts: [
      ...defaultConfig.resolver.assetExts,
      'tflite',   // TensorFlow Lite model
      'task',     // MediaPipe task bundle
      'lite',     // Alternative TFLite extension
      'bin',      // Binary model weights
    ],
    sourceExts: defaultConfig.resolver.sourceExts,
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(defaultConfig, config);
