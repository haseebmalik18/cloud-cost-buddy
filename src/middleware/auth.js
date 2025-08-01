const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

/**
 * JWT Authentication Middleware
 * Verifies JWT tokens and attaches user to request
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Required',
        message: 'Access token is required',
        timestamp: new Date().toISOString()
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const decoded = jwt.verify(token, jwtSecret);

    // Find user in database
    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash'] }
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid or expired token',
        timestamp: new Date().toISOString()
      });
    }

    // Update last seen
    user.last_login = new Date();
    await user.save();

    // Attach user to request
    req.user = user;
    req.userId = user.id;

    logger.info('User authenticated', {
      userId: user.id,
      email: user.email,
      requestId: req.id
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      requestId: req.id
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid token',
        timestamp: new Date().toISOString()
      });
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Token expired',
        timestamp: new Date().toISOString()
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Authentication service error',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user if token is present, but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
      ? authHeader.substring(7) 
      : null;

    if (!token) {
      return next();
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    const decoded = jwt.verify(token, jwtSecret);

    const user = await User.findByPk(decoded.userId, {
      attributes: { exclude: ['password_hash'] }
    });

    if (user && user.is_active) {
      req.user = user;
      req.userId = user.id;
    }

    next();
  } catch (error) {
    // Ignore token errors for optional auth
    next();
  }
};

/**
 * Check if user has required subscription tier
 */
const requireSubscription = (requiredTier = 'free') => {
  const tierLevels = { free: 0, pro: 1, enterprise: 2 };
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Required',
        message: 'Please log in to access this feature',
        timestamp: new Date().toISOString()
      });
    }

    const userTierLevel = tierLevels[req.user.subscription_tier] || 0;
    const requiredTierLevel = tierLevels[requiredTier] || 0;

    if (userTierLevel < requiredTierLevel) {
      return res.status(403).json({
        success: false,
        error: 'Subscription Required',
        message: `This feature requires ${requiredTier} subscription`,
        currentTier: req.user.subscription_tier,
        requiredTier,
        timestamp: new Date().toISOString()
      });
    }

    next();
  };
};

/**
 * Generate JWT token for user
 */
const generateToken = (user, expiresIn = '24h') => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email,
      tier: user.subscription_tier
    },
    jwtSecret,
    { expiresIn }
  );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = (user) => {
  const jwtSecret = process.env.JWT_REFRESH_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_REFRESH_SECRET environment variable is required');
  }
  
  return jwt.sign(
    { 
      userId: user.id, 
      type: 'refresh'
    },
    jwtSecret,
    { expiresIn: '7d' }
  );
};

module.exports = {
  authenticateToken,
  optionalAuth,
  requireSubscription,
  generateToken,
  generateRefreshToken
};