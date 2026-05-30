/**
 * ConfigStore — Runtime configuration management
 *
 * Reads admin-configurable parameters from MMKV.
 * All values have defaults defined in DEFAULT_CONFIG.
 * Admin writes go through setConfig() which persists immediately.
 */
import {storage} from './StorageInit';
import {FaceShieldConfig, DEFAULT_CONFIG, STORAGE_KEYS} from '../types';

const CONFIG_KEY = 'config:faceshield';

export class ConfigStore {
  private static _cache: FaceShieldConfig | null = null;

  static getConfig(): FaceShieldConfig {
    if (this._cache) return this._cache;

    const raw = storage.getString(CONFIG_KEY);
    if (!raw) {
      this._cache = {...DEFAULT_CONFIG};
      return this._cache;
    }
    try {
      this._cache = {...DEFAULT_CONFIG, ...JSON.parse(raw)};
      return this._cache;
    } catch {
      this._cache = {...DEFAULT_CONFIG};
      return this._cache;
    }
  }

  static setConfig(partial: Partial<FaceShieldConfig>): void {
    const current = this.getConfig();
    const updated = {...current, ...partial};
    storage.set(CONFIG_KEY, JSON.stringify(updated));
    this._cache = updated;
  }

  static getSimilarityThreshold(): number {
    const stored = storage.getNumber(STORAGE_KEYS.CONFIG_THRESHOLD);
    return stored ?? DEFAULT_CONFIG.similarityThreshold;
  }

  static setSimilarityThreshold(val: number): void {
    storage.set(STORAGE_KEYS.CONFIG_THRESHOLD, val);
    if (this._cache) this._cache.similarityThreshold = val;
  }

  static resetToDefaults(): void {
    storage.delete(CONFIG_KEY);
    this._cache = null;
  }
}
