import { APP_CONFIG } from '../config/constants';

export class RateLimiter {
  constructor(maxRequests, timeWindow) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = new Map();
  }

  async checkLimit(userId, type = 'default') {
    const now = Date.now();
    const key = `${userId}-${type}`;
    const userRequests = this.requests.get(key) || [];
    
    // Remove old requests outside the time window
    const validRequests = userRequests.filter(
      timestamp => now - timestamp < this.timeWindow
    );
    
    if (validRequests.length >= this.maxRequests) {
      const oldestRequest = validRequests[0];
      const waitTime = Math.ceil((this.timeWindow - (now - oldestRequest)) / 1000);
      throw new Error(`Rate limit exceeded. Please try again in ${waitTime} seconds`);
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }

  clearUserLimits(userId) {
    for (const key of this.requests.keys()) {
      if (key.startsWith(`${userId}-`)) {
        this.requests.delete(key);
      }
    }
  }
}

// Create rate limiters for different operations
export const apiRateLimiter = new RateLimiter(
  APP_CONFIG.RATE_LIMIT.API_CALLS_PER_MINUTE, 
  60000
);

export const uploadRateLimiter = new RateLimiter(
  APP_CONFIG.RATE_LIMIT.IMAGE_UPLOADS_PER_MINUTE, 
  60000
);
