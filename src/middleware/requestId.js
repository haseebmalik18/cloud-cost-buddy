const { v4: uuidv4 } = require('uuid');

/**
 * Request ID middleware
 * Adds a unique request ID to each request for better tracing and logging
 */
const requestId = (req, res, next) => {
  // Generate unique request ID
  const reqId = req.get('X-Request-ID') || uuidv4();
  
  // Attach to request object
  req.id = reqId;
  
  // Add to response headers
  res.set('X-Request-ID', reqId);
  
  next();
};

module.exports = requestId;