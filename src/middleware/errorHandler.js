const logger = require('../utils/logger');

/**
 * Error classification system
 */
class ErrorClassifier {
  static classify(err) {
    // Authentication/Authorization errors
    if (err.name === 'UnauthorizedError' || err.status === 401) {
      return 'auth';
    }
    
    // Permission errors
    if (err.name === 'AccessDenied' || err.name === 'UnauthorizedOperation' || 
        err.code === 'PERMISSION_DENIED' || err.status === 403) {
      return 'permission';
    }
    
    // Validation errors
    if (err.name === 'ValidationError' || err.name === 'CastError' || err.status === 400) {
      return 'validation';
    }
    
    // Rate limiting errors
    if (err.type === 'rate-limit' || err.status === 429) {
      return 'rate_limit';
    }
    
    // Network/connectivity errors
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNRESET' || 
        err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      return 'network';
    }
    
    // Cloud provider API errors
    if (err.code && (err.code.startsWith('AWS') || err.code.startsWith('Azure') || err.code.startsWith('GCP'))) {
      return 'cloud_api';
    }
    
    // Database errors
    if (err.name === 'SequelizeError' || err.name === 'MongoError' || 
        err.code === 'ER_ACCESS_DENIED_ERROR') {
      return 'database';
    }
    
    // File system errors
    if (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EMFILE') {
      return 'filesystem';
    }
    
    // JSON/parsing errors
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      return 'parsing';
    }
    
    // Resource not found
    if (err.status === 404 || err.name === 'NotFoundError') {
      return 'not_found';
    }
    
    // Server errors
    if (err.status >= 500 || !err.status) {
      return 'server';
    }
    
    return 'unknown';
  }
}

/**
 * Enhanced error response generator
 */
class ErrorResponse {
  constructor(type, err, req) {
    this.type = type;
    this.error = err;
    this.request = req;
    this.timestamp = new Date().toISOString();
    this.requestId = req.id || req.headers['x-request-id'];
  }

  generate() {
    const baseResponse = {
      success: false,
      timestamp: this.timestamp,
      requestId: this.requestId
    };

    switch (this.type) {
      case 'auth':
        return {
          ...baseResponse,
          status: 401,
          error: 'Authentication Required',
          message: 'Please provide valid authentication credentials.',
          code: 'AUTH_REQUIRED'
        };

      case 'permission':
        return {
          ...baseResponse,
          status: 403,
          error: 'Access Denied',
          message: this.getPermissionMessage(),
          code: 'ACCESS_DENIED'
        };

      case 'validation':
        return {
          ...baseResponse,
          status: 400,
          error: 'Validation Error',
          message: 'Invalid request data provided.',
          details: this.getValidationDetails(),
          code: 'VALIDATION_ERROR'
        };

      case 'rate_limit':
        return {
          ...baseResponse,
          status: 429,
          error: 'Rate Limit Exceeded',
          message: 'Too many requests. Please try again later.',
          retryAfter: this.error.retryAfter || 900,
          code: 'RATE_LIMIT_EXCEEDED'
        };

      case 'network':
        return {
          ...baseResponse,
          status: 503,
          error: 'Service Unavailable',
          message: 'Network connectivity issue. Please try again later.',
          code: 'NETWORK_ERROR'
        };

      case 'cloud_api':
        return {
          ...baseResponse,
          status: 502,
          error: 'Cloud Provider Error',
          message: 'Cloud provider API error occurred.',
          provider: this.getCloudProvider(),
          code: 'CLOUD_API_ERROR'
        };

      case 'database':
        return {
          ...baseResponse,
          status: 503,
          error: 'Database Error',
          message: 'Database operation failed. Please try again later.',
          code: 'DATABASE_ERROR'
        };

      case 'parsing':
        return {
          ...baseResponse,
          status: 400,
          error: 'Bad Request',
          message: 'Invalid JSON in request body.',
          code: 'INVALID_JSON'
        };

      case 'not_found':
        return {
          ...baseResponse,
          status: 404,
          error: 'Not Found',
          message: 'The requested resource was not found.',
          code: 'RESOURCE_NOT_FOUND'
        };

      case 'server':
      default:
        return {
          ...baseResponse,
          status: 500,
          error: 'Internal Server Error',
          message: process.env.NODE_ENV === 'production' 
            ? 'An unexpected error occurred. Please try again later.'
            : this.error.message || 'Internal server error occurred.',
          code: 'INTERNAL_ERROR',
          ...(process.env.NODE_ENV === 'development' && { 
            stack: this.error.stack,
            details: this.error 
          })
        };
    }
  }

  getPermissionMessage() {
    if (this.error.message && this.error.message.includes('AWS')) {
      return 'AWS IAM permissions insufficient. Please check your role configuration.';
    }
    if (this.error.message && this.error.message.includes('Azure')) {
      return 'Azure permissions insufficient. Please check your service principal configuration.';
    }
    if (this.error.message && this.error.message.includes('GCP')) {
      return 'GCP permissions insufficient. Please check your service account configuration.';
    }
    return 'Insufficient permissions for this operation.';
  }

  getValidationDetails() {
    if (this.error.details) {
      return this.error.details;
    }
    if (this.error.errors) {
      return Object.values(this.error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
    }
    return null;
  }

  getCloudProvider() {
    if (this.error.code && this.error.code.includes('AWS')) return 'aws';
    if (this.error.code && this.error.code.includes('Azure')) return 'azure';
    if (this.error.code && this.error.code.includes('GCP')) return 'gcp';
    if (this.request.path.includes('/aws/')) return 'aws';
    if (this.request.path.includes('/azure/')) return 'azure';
    if (this.request.path.includes('/gcp/')) return 'gcp';
    return 'unknown';
  }
}

/**
 * Enhanced global error handling middleware
 */
const errorHandler = (err, req, res, next) => {
  // Skip if response already sent
  if (res.headersSent) {
    return next(err);
  }

  // Classify the error
  const errorType = ErrorClassifier.classify(err);
  
  // Generate appropriate response
  const errorResponse = new ErrorResponse(errorType, err, req);
  const response = errorResponse.generate();

  // Enhanced logging with more context
  const logData = {
    errorType,
    status: response.status,
    message: err.message,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.userId,
    requestId: req.id,
    timestamp: response.timestamp,
    stack: err.stack
  };

  // Log based on severity
  if (response.status >= 500) {
    logger.error('Server error occurred', logData);
  } else if (response.status >= 400) {
    logger.warn('Client error occurred', logData);
  } else {
    logger.info('Request completed with error', logData);
  }

  // Send error response
  res.status(response.status).json({
    success: response.success,
    error: response.error,
    message: response.message,
    code: response.code,
    timestamp: response.timestamp,
    requestId: response.requestId,
    ...(response.details && { details: response.details }),
    ...(response.retryAfter && { retryAfter: response.retryAfter }),
    ...(response.provider && { provider: response.provider }),
    ...(response.stack && { stack: response.stack })
  });
};

/**
 * 404 handler for undefined routes
 */
const notFoundHandler = (req, res) => {
  const response = {
    success: false,
    error: 'Not Found',
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    code: 'ENDPOINT_NOT_FOUND',
    timestamp: new Date().toISOString(),
    requestId: req.id,
    availableEndpoints: [
      '/health',
      '/api',
      '/api/auth',
      '/api/accounts',
      '/api/aws',
      '/api/azure',
      '/api/gcp',
      '/api/dashboard',
      '/api/alerts'
    ]
  };

  logger.warn('404 - Route not found', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: response.timestamp
  });

  res.status(404).json(response);
};

/**
 * Async error wrapper for route handlers
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    return Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  ErrorClassifier,
  ErrorResponse
};

  // AWS SDK errors
  if (err.name === 'AccessDenied' || err.name === 'UnauthorizedOperation') {
    const message = 'Access denied. Please check AWS IAM permissions.';
    return res.status(403).json({
      success: false,
      error: 'Access Denied',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Azure SDK errors
  if (err.code === 'ENOTFOUND' && err.hostname && err.hostname.includes('azure')) {
    const message = 'Azure service unavailable. Please check your Azure configuration.';
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // GCP SDK errors
  if (err.code === 'PERMISSION_DENIED' || (err.message && err.message.includes('permission'))) {
    const message = 'Permission denied. Please check GCP service account permissions.';
    return res.status(403).json({
      success: false,
      error: 'Permission Denied',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    const message = 'Invalid request data provided.';
    return res.status(400).json({
      success: false,
      error: 'Validation Error',
      message,
      details: err.details || null,
      timestamp: new Date().toISOString()
    });
  }

  // Rate limit errors
  if (err.type === 'rate-limit') {
    return res.status(429).json({
      success: false,
      error: 'Rate Limit Exceeded',
      message: 'Too many requests. Please try again later.',
      retryAfter: err.retryAfter || 900,
      timestamp: new Date().toISOString()
    });
  }

  // Database connection errors
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    const message = 'Database connection failed. Please try again later.';
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // Network/timeout errors
  if (err.code === 'ENOTFOUND' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    const message = 'Network error occurred. Please check your connection and try again.';
    return res.status(503).json({
      success: false,
      error: 'Network Error',
      message,
      timestamp: new Date().toISOString()
    });
  }

  // JSON parsing errors
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Invalid JSON in request body.',
      timestamp: new Date().toISOString()
    });
  }

  // Default server error
  const statusCode = error.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error occurred.' 
    : error.message || 'Internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? 'Internal Server Error' : 'Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;