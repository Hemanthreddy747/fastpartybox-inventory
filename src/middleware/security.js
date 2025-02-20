import { APP_CONFIG } from '../config/constants';

export const SecurityHeaders = {
  'Content-Security-Policy': 
    "default-src 'self'; " +
    "script-src 'self' https://apis.google.com https://www.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "img-src 'self' data: https: blob:; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://firestore.googleapis.com https://firebase.googleapis.com; " +
    "frame-src 'self' https://billingselling.com",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export const validateInput = (input, type = 'text') => {
  const sanitized = input.trim();
  
  switch(type) {
    case 'text':
      return sanitized.replace(/[<>]/g, '');
    case 'number':
      return !isNaN(sanitized) ? parseFloat(sanitized) : 0;
    case 'email':
      return sanitized.toLowerCase().match(
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
      ) ? sanitized : '';
    default:
      return sanitized;
  }
};

export const rateLimiter = (() => {
  const requests = new Map();
  
  return {
    checkLimit: (userId, operation = 'default') => {
      const now = Date.now();
      const key = `${userId}-${operation}`;
      const userRequests = requests.get(key) || [];
      
      // Remove old requests
      const validRequests = userRequests.filter(
        time => now - time < 60000 // 1 minute window
      );
      
      if (validRequests.length >= APP_CONFIG.RATE_LIMIT.API_CALLS_PER_MINUTE) {
        throw new Error('Rate limit exceeded');
      }
      
      validRequests.push(now);
      requests.set(key, validRequests);
      return true;
    }
  };
})();

export const encryptData = (data, key) => {
  // Implementation of encryption (use a proper encryption library in production)
  return btoa(JSON.stringify(data));
};

export const decryptData = (encryptedData, key) => {
  // Implementation of decryption (use a proper encryption library in production)
  return JSON.parse(atob(encryptedData));
};