/**
 * FaceShield Edge — App Entry Point
 *
 * Boots storage initialisation before mounting the React tree,
 * so MMKV encrypted storage is ready before any component renders.
 */
import {AppRegistry} from 'react-native';
import {initStorage} from './src/services/StorageInit';
import {name as appName} from './app.json';

// Boot encrypted MMKV storage, then mount the app
initStorage()
  .then(() => {
    const App = require('./App').default;
    AppRegistry.registerComponent(appName, () => App);
  })
  .catch(err => {
    console.error('[FaceShield] Storage init failed:', err);
    // Fallback: mount without encryption (should never happen)
    const App = require('./App').default;
    AppRegistry.registerComponent(appName, () => App);
  });
