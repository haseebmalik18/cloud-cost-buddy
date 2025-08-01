const logger = require('../utils/logger');

/**
 * Input validation middleware for API endpoints
 */

/**
 * Validate date format (YYYY-MM-DD)
 */
const isValidDate = (dateString) => {
  if (!dateString || typeof dateString !== 'string') return false;
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) return false;
  
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date) && date.toISOString().split('T')[0] === dateString;
};

/**
 * Validate date range
 */
const isValidDateRange = (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return false;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const now = new Date();
  
  // End date should be after start date
  if (end <= start) return false;
  
  // Dates shouldn't be too far in the future
  if (start > now || end > now) return false;
  
  // Limit date range to reasonable period (e.g., 2 years)
  const maxRangeMs = 2 * 365 * 24 * 60 * 60 * 1000; // 2 years
  if (end.getTime() - start.getTime() > maxRangeMs) return false;
  
  return true;
};

/**
 * Validate provider name
 */
const isValidProvider = (provider) => {
  const validProviders = ['aws', 'azure', 'gcp', 'all'];
  return validProviders.includes(provider?.toLowerCase());
};

/**
 * Validate granularity
 */
const isValidGranularity = (granularity) => {
  const validGranularities = ['daily', 'monthly', 'hourly', 'Daily', 'Monthly', 'Hourly'];
  return validGranularities.includes(granularity);
};

/**
 * Validate pagination parameters
 */
const isValidPagination = (page, limit) => {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  
  return (
    (!page || (pageNum > 0 && pageNum <= 1000)) &&
    (!limit || (limitNum > 0 && limitNum <= 100))
  );
};

/**
 * Validate trends query parameters
 */
const validateTrendsQuery = (req, res, next) => {
  const { startDate, endDate, granularity = 'Daily', provider = 'all' } = req.query;
  const errors = [];

  // Required parameters
  if (!startDate) {
    errors.push('startDate parameter is required (format: YYYY-MM-DD)');
  } else if (!isValidDate(startDate)) {
    errors.push('startDate must be a valid date in YYYY-MM-DD format');
  }

  if (!endDate) {
    errors.push('endDate parameter is required (format: YYYY-MM-DD)');
  } else if (!isValidDate(endDate)) {
    errors.push('endDate must be a valid date in YYYY-MM-DD format');
  }

  // Date range validation
  if (startDate && endDate && isValidDate(startDate) && isValidDate(endDate)) {
    if (!isValidDateRange(startDate, endDate)) {
      errors.push('Invalid date range. Ensure startDate is before endDate and dates are not in the future');
    }
  }

  // Optional parameters
  if (granularity && !isValidGranularity(granularity)) {
    errors.push('granularity must be one of: Daily, Monthly, Hourly');
  }

  if (provider && !isValidProvider(provider)) {
    errors.push('provider must be one of: aws, azure, gcp, all');
  }

  if (errors.length > 0) {
    logger.warn('Trends query validation failed:', { errors, query: req.query });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Invalid query parameters',
      details: { errors },
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Validate cost query parameters
 */
const validateCostQuery = (req, res, next) => {
  const { services, accountId } = req.query;
  const errors = [];

  // Services filter validation
  if (services) {
    if (typeof services === 'string') {
      const servicesList = services.split(',').map(s => s.trim()).filter(s => s);
      if (servicesList.length === 0) {
        errors.push('services parameter cannot be empty if provided');
      } else if (servicesList.length > 50) {
        errors.push('services parameter cannot contain more than 50 services');
      }
      req.query.services = servicesList;
    } else {
      errors.push('services parameter must be a comma-separated string');
    }
  }

  // Account ID validation (for AWS budgets)
  if (accountId && !/^\d{12}$/.test(accountId)) {
    errors.push('accountId must be a 12-digit AWS account ID');
  }

  if (errors.length > 0) {
    logger.warn('Cost query validation failed:', { errors, query: req.query });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Invalid query parameters',
      details: { errors },
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Validate comparison query parameters
 */
const validateComparisonQuery = (req, res, next) => {
  const { metric = 'cost', period = 'current' } = req.query;
  const errors = [];

  // Metric validation
  const validMetrics = ['cost', 'usage', 'service_count'];
  if (!validMetrics.includes(metric)) {
    errors.push(`metric must be one of: ${validMetrics.join(', ')}`);
  }

  // Period validation
  const validPeriods = ['current', 'previous', 'month', 'quarter', 'year'];
  if (!validPeriods.includes(period)) {
    errors.push(`period must be one of: ${validPeriods.join(', ')}`);
  }

  if (errors.length > 0) {
    logger.warn('Comparison query validation failed:', { errors, query: req.query });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Invalid query parameters',
      details: { errors },
      timestamp: new Date().toISOString()
    });
  }

  next();
};

/**
 * Validate pagination query parameters
 */
const validatePagination = (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const errors = [];

  if (!isValidPagination(page, limit)) {
    errors.push('page must be a positive integer <= 1000 and limit must be a positive integer <= 100');
  }

  if (errors.length > 0) {
    logger.warn('Pagination validation failed:', { errors, query: req.query });
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message: 'Invalid pagination parameters',
      details: { errors },
      timestamp: new Date().toISOString()
    });
  }

  // Normalize values
  req.query.page = parseInt(page);
  req.query.limit = parseInt(limit);

  next();
};

/**
 * Sanitize input to prevent XSS and injection attacks
 */
const sanitizeInput = (req, res, next) => {
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      // Remove HTML tags and dangerous characters
      return obj
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/[<>'"&]/g, (match) => {
          const entities = {
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '&': '&amp;'
          };
          return entities[match];
        })
        .trim();
    } else if (Array.isArray(obj)) {
      return obj.map(sanitize);
    } else if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };

  // Sanitize query parameters
  req.query = sanitize(req.query);
  
  // Sanitize body if present
  if (req.body) {
    req.body = sanitize(req.body);
  }

  next();
};

/**
 * Rate limiting validation
 */
const validateRateLimit = (windowMs = 15 * 60 * 1000, maxRequests = 100) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up old entries
    for (const [ip, data] of requests.entries()) {
      if (now - data.firstRequest > windowMs) {
        requests.delete(ip);
      }
    }

    // Check current request count
    const userData = requests.get(key);
    
    if (!userData) {
      requests.set(key, { firstRequest: now, count: 1 });
      next();
    } else if (userData.count >= maxRequests) {
      logger.warn(`Rate limit exceeded for IP: ${key}`);
      res.status(429).json({
        success: false,
        error: 'Rate Limit Exceeded',
        message: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil((userData.firstRequest + windowMs - now) / 1000),
        timestamp: new Date().toISOString()
      });
    } else {
      userData.count++;
      next();
    }
  };
};

module.exports = {
  validateTrendsQuery,
  validateCostQuery,
  validateComparisonQuery,
  validatePagination,
  sanitizeInput,
  validateRateLimit,
  // Export validation helpers for testing
  isValidDate,
  isValidDateRange,
  isValidProvider,
  isValidGranularity
};