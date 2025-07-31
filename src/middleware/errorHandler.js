const logger = require('../utils/logger');

/**
 * Global error handling middleware for Express applications
 * Handles different types of errors and provides appropriate responses
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  logger.error(`Error occurred: ${error.message}`, {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });

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