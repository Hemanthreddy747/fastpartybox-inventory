export const APP_CONFIG = {
  APP_NAME: "FastPartyBox",
  DOMAIN: "fastpartybox.com",
  VERSION: "1.0.0",
  MAX_PRODUCTS_PER_USER: 10000,
  MAX_IMAGE_SIZE_MB: 0.5,
  MAX_IMAGE_DIMENSION: 800,
  BATCH_SIZE: 400,
  CACHE_DURATION: 24 * 60 * 60 * 1000, // 24 hours
  SYNC_INTERVAL: 5000, // 5 seconds
  RATE_LIMIT: {
    API_CALLS_PER_MINUTE: 100,
    IMAGE_UPLOADS_PER_MINUTE: 20,
  },
  META: {
    TITLE: "FastPartyBox - Fast & Easy Billing and Inventory Management",
    DESCRIPTION:
      "Streamline your business with FastPartyBox. Powerful billing software with inventory management, offline support, and real-time stock updates.",
    KEYWORDS: [
      "billing software",
      "inventory management",
      "stock management",
      "POS system",
      "retail software",
      "wholesale billing",
      "offline billing",
      "small business software",
      "Indian billing software",
    ],
  },
};

export const TIER_PRICES = {
  FREE: 0,
  PAID: 269,
};

export const SUBSCRIPTION_TIERS = {
  FREE: {
    maxProducts: 100,
    maxOrders: Number.MAX_SAFE_INTEGER,  // Practically unlimited orders
    trialPeriodDays: 90,
    price: 0,
    features: [
      "Up to 100 products",
      "Unlimited orders per month",
      "Basic inventory management",
      "Simple billing",
      "90-day free trial",
    ],
    limits: {
      batchUploadSize: 50,
      imageStorageGB: 0.5,
      offlineSync: true,
    },
  },
  PAID: {
    maxProducts: 1000,
    maxOrders: Number.MAX_SAFE_INTEGER,  // Practically unlimited orders
    price: 269,
    features: [
      "Up to 1000 products",
      "Unlimited orders per month",
      "Advanced inventory management",
      "Detailed analytics",
      "Priority support",
      "Bulk operations",
      "Extended offline support",
    ],
    limits: {
      batchUploadSize: 500,
      imageStorageGB: 5,
      offlineSync: true,
    },
  },
};

export const PAYMENT_CONFIG = {
  CURRENCY: "INR",
  TAX_RATE: 0.18,
  PAYMENT_METHODS: ["UPI", "Bank Transfer"],
  SUBSCRIPTION_PERIODS: {
    MONTHLY: 30,
    QUARTERLY: 90,
    YEARLY: 365,
  },
};
