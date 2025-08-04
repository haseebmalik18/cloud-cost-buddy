const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const validator = require('validator');
const logger = require('../utils/logger');

/**
 * Security Configuration
 */
const SECURITY_CONFIG = {
  // Maximum request body size
  MAX_BODY_SIZE: '10mb',
  
  // Session configuration
  SESSION_CONFIG: {
    name: 'cloudcost.sid', // Don't use default session name
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'
    }
  },

  // CORS configuration
  CORS_CONFIG: {
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) return callback(null, true);
      
      const allowedOrigins = [
        'https://cloudcostbuddy.app',
        'https://app.cloudcostbuddy.com',
        'https://demo.cloudcostbuddy.com'
      ];

      // In development, allow localhost
      if (process.env.NODE_ENV === 'development') {
        allowedOrigins.push(
          'http://localhost:3000',
          'http://localhost:19006', // Expo development
          'exp://localhost:19000' // Expo development
        );
      }

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked request from origin:', origin);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-ID',
      'Accept',
      'Origin'
    ],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400 // 24 hours
  }
};

/**
 * Enhanced helmet configuration for security headers
 */
const helmetConfig = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: [
        "'self'",
        "https://api.aws.amazon.com",
        "https://management.azure.com",
        "https://cloudbilling.googleapis.com",
        "https://bigquery.googleapis.com"
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false, // Disable for API compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "same-origin" },
  xssFilter: true
};

/**
 * Input sanitization middleware
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Recursively sanitize object properties
    const sanitizeObject = (obj) => {
      if (typeof obj !== 'object' || obj === null) {
        return obj;
      }

      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }

      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip if key contains suspicious patterns
        if (key.includes('__proto__') || key.includes('constructor') || key.includes('prototype')) {
          continue;
        }

        if (typeof value === 'string') {
          // Basic XSS protection
          sanitized[key] = validator.escape(value).trim();
        } else {
          sanitized[key] = sanitizeObject(value);
        }
      }
      return sanitized;
    };

    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    next();
  } catch (error) {
    logger.error('Input sanitization error:', error);
    return res.status(400).json({
      success: false,
      error: 'Invalid input data',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Request validation middleware
 */
const validateRequest = (req, res, next) => {
  // Check for common injection patterns
  const suspiciousPatterns = [
    /(\<|%3C)(\s*)script.*(\>|%3E)/i,
    /(\<|%3C)(\s*)iframe.*(\>|%3E)/i,
    /(\<|%3C)(\s*)object.*(\>|%3E)/i,
    /(\<|%3C)(\s*)embed.*(\>|%3E)/i,
    /javascript\s*:/i,
    /vbscript\s*:/i,
    /on\w+\s*=/i,
    /union.*select/i,
    /insert.*into/i,
    /delete.*from/i,
    /update.*set/i,
    /drop.*table/i
  ];

  const checkString = (str) => {
    if (typeof str !== 'string') return false;
    return suspiciousPatterns.some(pattern => pattern.test(str));
  };

  const checkObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) {
      return checkString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.some(checkObject);
    }

    return Object.values(obj).some(checkObject);
  };

  // Check request body and query parameters
  if (checkObject(req.body) || checkObject(req.query)) {
    logger.warn('Suspicious request detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      body: req.body,
      query: req.query
    });

    return res.status(400).json({
      success: false,
      error: 'Invalid request data',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Request size limiter
 */
const requestSizeLimit = (req, res, next) => {
  const contentLength = parseInt(req.get('Content-Length') || '0');
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (contentLength > maxSize) {
    logger.warn('Request too large', {
      ip: req.ip,
      contentLength,
      maxSize,
      path: req.path
    });

    return res.status(413).json({
      success: false,
      error: 'Request entity too large',
      maxSize: '10MB',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Security headers middleware
 */
const securityHeaders = (req, res, next) => {
  // Additional security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), location=()');
  
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');

  next();
};

/**
 * IP whitelist middleware (for critical endpoints)
 */
const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured
    }

    if (!allowedIPs.includes(clientIP)) {
      logger.warn('IP not whitelisted', { ip: clientIP, path: req.path });
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * API key validation middleware
 */
const validateApiKey = (req, res, next) => {
  const apiKey = req.get('X-API-Key');
  
  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      timestamp: new Date().toISOString()
    });
  }

  // Validate API key format
  if (!validator.isUUID(apiKey)) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key format',
      timestamp: new Date().toISOString()
    });
  }

  // TODO: Validate against database
  // For now, just check against environment variable
  const validApiKeys = (process.env.VALID_API_KEYS || '').split(',');
  
  if (!validApiKeys.includes(apiKey)) {
    logger.warn('Invalid API key used', { apiKey, ip: req.ip });
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Slow down middleware for repeated requests
 */
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 10, // Allow 10 requests per windowMs without delay
  delayMs: 500, // Add 500ms delay per request after delayAfter
  maxDelayMs: 20000, // Maximum delay of 20 seconds
  onLimitReached: (req, res, options) => {
    logger.warn('Speed limit reached', {
      ip: req.ip,
      path: req.path,
      delay: options.delay
    });
  }
});

module.exports = {
  SECURITY_CONFIG,
  helmetConfig,
  sanitizeInput,
  validateRequest,
  requestSizeLimit,
  securityHeaders,
  ipWhitelist,
  validateApiKey,
  speedLimiter
};