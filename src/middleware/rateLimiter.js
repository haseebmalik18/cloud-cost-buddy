const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('redis');
const logger = require('../utils/logger');

let redisClient;

// Initialize Redis client if available
if (process.env.REDIS_URL) {
  try {
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 5000,
        lazyConnect: true
      }
    });

    redisClient.on('error', (err) => {
      logger.warn('Redis connection error for rate limiting:', err.message);
      redisClient = null;
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected for rate limiting');
    });
  } catch (error) {
    logger.warn('Failed to initialize Redis for rate limiting:', error.message);
    redisClient = null;
  }
}

/**
 * Create rate limiter with optional Redis store
 */
const createRateLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests from this IP, please try again later.',
      retryAfter: Math.ceil(options.windowMs ? options.windowMs / 1000 : 900)
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userId: req.userId,
        path: req.path,
        userAgent: req.get('User-Agent')
      });
      
      res.status(429).json(defaultOptions.message);
    }
  };

  const mergedOptions = { ...defaultOptions, ...options };

  // Use Redis store if available
  if (redisClient && process.env.NODE_ENV === 'production') {
    mergedOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }

  return rateLimit(mergedOptions);
};

/**
 * Global API rate limiter
 */
const globalRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: 'Too many API requests, please try again later.',
    retryAfter: 900
  }
});

/**
 * Strict rate limiter for authentication endpoints
 */
const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // more restrictive for auth
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 900
  },
  skipSuccessfulRequests: true // don't count successful requests
});

/**
 * Rate limiter for cloud provider API calls
 * More restrictive to avoid hitting cloud provider limits
 */
const cloudApiRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per user
  keyGenerator: (req) => {
    // Rate limit per user, not per IP for cloud API calls
    return req.userId || req.ip;
  },
  message: {
    error: 'Too many cloud API requests, please try again later.',
    retryAfter: 60
  }
});

/**
 * Rate limiter for expensive operations like cost analysis
 */
const expensiveOperationRateLimit = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 requests per 5 minutes
  keyGenerator: (req) => {
    return req.userId || req.ip;
  },
  message: {
    error: 'Too many expensive operations, please wait before trying again.',
    retryAfter: 300
  }
});

/**
 * Rate limiter for account management operations
 */
const accountManagementRateLimit = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 account operations per 10 minutes
  keyGenerator: (req) => {
    return req.userId || req.ip;
  },
  message: {
    error: 'Too many account management operations, please try again later.',
    retryAfter: 600
  }
});

/**
 * Dynamic rate limiter based on user tier (future enhancement)
 */
const createTieredRateLimit = (req, res, next) => {
  // Default limits
  let windowMs = 15 * 60 * 1000; // 15 minutes
  let max = 100;

  // Adjust based on user tier if available
  if (req.user && req.user.tier) {
    switch (req.user.tier) {
      case 'premium':
        max = 500;
        break;
      case 'enterprise':
        max = 1000;
        break;
      case 'free':
      default:
        max = 100;
        break;
    }
  }

  const limiter = createRateLimiter({ windowMs, max });
  return limiter(req, res, next);
};

module.exports = {
  globalRateLimit,
  authRateLimit,
  cloudApiRateLimit,
  expensiveOperationRateLimit,
  accountManagementRateLimit,
  createTieredRateLimit,
  createRateLimiter
};