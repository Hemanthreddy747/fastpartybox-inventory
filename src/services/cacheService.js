import { APP_CONFIG } from '../config/constants';

export class CacheService {
  constructor() {
    this.cache = new Map();
  }

  set(key, value, ttl = APP_CONFIG.CACHE_DURATION) {
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  clear() {
    this.cache.clear();
  }

  clearExpired() {
    for (const [key, value] of this.cache.entries()) {
      if (Date.now() > value.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

export const globalCache = new CacheService();