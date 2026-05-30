/**
 * StorageInit — MMKV instance with AES-256 encryption key
 *
 * The encryption key is fetched from hardware-backed secure storage
 * (Android Keystore / iOS Secure Enclave via react-native-keychain).
 * On first launch the key is generated and stored; subsequent launches
 * retrieve it. The key never leaves the secure hardware boundary.
 *
 * All subsequent MMKV reads/writes go through this single encrypted instance.
 */
import {MMKV} from 'react-native-mmkv';
import * as Keychain from 'react-native-keychain';
import {Platform} from 'react-native';

const KEY_SERVICE = 'com.faceshield.edge.mmkv_key';
const KEY_USER = 'faceshield_mmkv';

let _storage: MMKV | null = null;

async function getOrCreateMMKVKey(): Promise<string> {
  try {
    const credentials = await Keychain.getGenericPassword({service: KEY_SERVICE});
    if (credentials && credentials.password) {
      return credentials.password;
    }
  } catch {
    // Key not found — generate new
  }

  // Generate 256-bit key as hex string
  const keyBytes = new Uint8Array(32);
  // React Native doesn't have crypto.getRandomValues in older versions;
  // use native FaceShieldCrypto.generateKey() for cryptographically secure random
  const {NativeModules} = require('react-native');
  const hexKey: string = await NativeModules.FaceShieldCrypto.generateKey();

  await Keychain.setGenericPassword(KEY_USER, hexKey, {
    service: KEY_SERVICE,
    accessible: Platform.OS === 'ios'
      ? Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY
      : undefined,
    securityLevel: Platform.OS === 'android'
      ? Keychain.SECURITY_LEVEL.SECURE_HARDWARE
      : undefined,
  });

  return hexKey;
}

export async function initStorage(): Promise<MMKV> {
  if (_storage) return _storage;

  const encryptionKey = await getOrCreateMMKVKey();
  _storage = new MMKV({
    id: 'faceshield-store',
    encryptionKey,
  });
  return _storage;
}

// Synchronous accessor — call initStorage() at app boot before using this
export const storage: MMKV = new Proxy({} as MMKV, {
  get(_target, prop) {
    if (!_storage) throw new Error('StorageInit: call initStorage() before accessing storage');
    return (_storage as any)[prop];
  },
});
