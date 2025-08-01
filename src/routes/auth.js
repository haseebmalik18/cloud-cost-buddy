const express = require('express');
const Joi = require('joi');
const validator = require('validator');
const PasswordValidator = require('password-validator');
const rateLimit = require('express-rate-limit');
const { User } = require('../models');
const { generateToken, generateRefreshToken, authenticateToken } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/validators');
const logger = require('../utils/logger');

const router = express.Router();

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    error: 'Too Many Attempts',
    message: 'Too many authentication attempts, please try again later',
    retryAfter: 15 * 60
  }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registrations per hour per IP
  message: {
    success: false,
    error: 'Registration Limit Exceeded',
    message: 'Too many registration attempts, please try again later',
    retryAfter: 60 * 60
  }
});

// Password validation
const passwordSchema = new PasswordValidator();
passwordSchema
  .is().min(8)
  .has().uppercase()
  .has().lowercase()
  .has().digits()
  .has().symbols()
  .has().not().spaces();

// In-memory store for login attempts (use Redis in production)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOCKOUT_TIME = parseInt(process.env.LOCKOUT_TIME_MINUTES) || 30;

const isAccountLocked = (email) => {
  const attempts = loginAttempts.get(email);
  if (!attempts) return { locked: false };
  
  const now = Date.now();
  const lockoutEndTime = attempts.lastAttempt + (LOCKOUT_TIME * 60 * 1000);
  
  if (attempts.count >= MAX_LOGIN_ATTEMPTS && now < lockoutEndTime) {
    return { locked: true, timeRemaining: Math.ceil((lockoutEndTime - now) / 60000) };
  }
  
  if (now >= lockoutEndTime) {
    loginAttempts.delete(email);
  }
  
  return { locked: false };
};

const recordFailedAttempt = (email) => {
  const attempts = loginAttempts.get(email) || { count: 0, lastAttempt: Date.now() };
  attempts.count += 1;
  attempts.lastAttempt = Date.now();
  loginAttempts.set(email, attempts);
};

const clearLoginAttempts = (email) => {
  loginAttempts.delete(email);
};

// Validation schemas
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  firstName: Joi.string().min(1).max(50).required(),
  lastName: Joi.string().min(1).max(50).required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
});

/**
 * POST /api/auth/register
 * Register a new user account
 */
router.post('/register', registrationLimiter, sanitizeInput, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your input data',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { email, password, firstName, lastName } = value;

    // Validate email format more strictly
    if (!validator.isEmail(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Email',
        message: 'Please provide a valid email address',
        timestamp: new Date().toISOString()
      });
    }

    // Validate password strength
    const passwordValidation = passwordSchema.validate(password, { list: true });
    if (passwordValidation.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Weak Password',
        message: 'Password does not meet security requirements',
        details: passwordValidation.map(rule => {
          switch (rule) {
            case 'min': return 'Password must be at least 8 characters long';
            case 'uppercase': return 'Password must contain at least one uppercase letter';
            case 'lowercase': return 'Password must contain at least one lowercase letter';
            case 'digits': return 'Password must contain at least one number';
            case 'symbols': return 'Password must contain at least one special character';
            case 'spaces': return 'Password must not contain spaces';
            default: return `Password validation failed: ${rule}`;
          }
        }),
        timestamp: new Date().toISOString()
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ where: { email: email.toLowerCase() } });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'Registration Failed',
        message: 'An account with this email already exists',
        timestamp: new Date().toISOString()
      });
    }

    // Hash password and create user
    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      email: email.toLowerCase(),
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      subscription_tier: 'free'
    });

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info('User registered successfully', {
      userId: user.id,
      email: user.email,
      requestId: req.id
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        user: user.toJSON(),
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '24h'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Authenticate user and return access token
 */
router.post('/login', authLimiter, sanitizeInput, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please provide valid email and password',
        timestamp: new Date().toISOString()
      });
    }

    const { email, password } = value;

    // Check if account is locked
    const lockStatus = isAccountLocked(email.toLowerCase());
    if (lockStatus.locked) {
      return res.status(423).json({
        success: false,
        error: 'Account Locked',
        message: `Account is temporarily locked due to too many failed login attempts. Try again in ${lockStatus.timeRemaining} minutes.`,
        retryAfter: lockStatus.timeRemaining * 60,
        timestamp: new Date().toISOString()
      });
    }

    // Find user by email
    const user = await User.findOne({ 
      where: { email: email.toLowerCase() }
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid email or password',
        timestamp: new Date().toISOString()
      });
    }

    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      // Record failed attempt
      recordFailedAttempt(email.toLowerCase());
      
      logger.warn('Failed login attempt', {
        email: user.email,
        requestId: req.id,
        ip: req.ip
      });

      return res.status(401).json({
        success: false,
        error: 'Authentication Failed',
        message: 'Invalid email or password',
        timestamp: new Date().toISOString()
      });
    }

    // Clear any existing login attempts on successful login
    clearLoginAttempts(email.toLowerCase());

    // Update last login
    user.last_login = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info('User logged in successfully', {
      userId: user.id,
      email: user.email,
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '24h'
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    // Get user with cloud accounts
    const user = await User.findByPk(req.userId, {
      include: [{
        association: 'cloudAccounts',
        where: { is_active: true },
        required: false
      }]
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User Not Found',
        message: 'User account not found',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/auth/me
 * Update current user profile
 */
router.put('/me', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const updateSchema = Joi.object({
      firstName: Joi.string().min(1).max(50),
      lastName: Joi.string().min(1).max(50),
    }).min(1);

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your input data',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User Not Found',
        message: 'User account not found',
        timestamp: new Date().toISOString()
      });
    }

    // Update user fields
    if (value.firstName) user.first_name = value.firstName;
    if (value.lastName) user.last_name = value.lastName;

    await user.save();

    logger.info('User profile updated', {
      userId: user.id,
      changes: Object.keys(value),
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/logout
 * Logout user (client-side token removal)
 */
router.post('/logout', authenticateToken, async (req, res, next) => {
  try {
    logger.info('User logged out', {
      userId: req.userId,
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/auth/connect/aws
 * Connect AWS account using OAuth token from mobile app
 */
router.post('/connect/aws', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const connectSchema = Joi.object({
      accessToken: Joi.string().required(),
      accountName: Joi.string().min(1).max(100).optional(),
      region: Joi.string().default('us-east-1')
    });

    const { error, value } = connectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your AWS connection details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accessToken, accountName, region } = value;

    // Validate token and get AWS account details
    const AWS = require('aws-sdk');
    AWS.config.update({
      accessKeyId: accessToken,
      region: region
    });

    const sts = new AWS.STS();
    const identity = await sts.getCallerIdentity().promise();

    // Check if account already exists
    const { CloudAccount } = require('../models');
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'aws',
        account_id: identity.Account,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Connected',
        message: 'This AWS account is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'aws',
      account_name: accountName || `AWS Account ${identity.Account}`,
      account_id: identity.Account,
      is_active: true,
      metadata: {
        arn: identity.Arn,
        userId: identity.UserId,
        region,
        setupDate: new Date().toISOString(),
        connectionType: 'oauth'
      }
    });

    // Encrypt and store credentials
    cloudAccount.encryptCredentials({
      accessToken,
      region,
      accountId: identity.Account,
      arn: identity.Arn
    });
    await cloudAccount.save();

    // Test connection
    try {
      const CloudServiceFactory = require('../services/CloudServiceFactory');
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'aws', identity.Account);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Test Failed',
          message: 'Failed to validate AWS connection',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Test Failed',
        message: 'Failed to test AWS connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('AWS account connected via OAuth', {
      userId: req.userId,
      accountId: identity.Account,
      accountName: cloudAccount.account_name,
      requestId: req.id
    });

    res.status(201).json({
      success: true,
      message: 'AWS account connected successfully',
      data: {
        account: cloudAccount.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('AWS OAuth connection error', {
      error: error.message,
      userId: req.userId,
      requestId: req.id
    });
    next(error);
  }
});

/**
 * POST /api/auth/connect/azure
 * Connect Azure account using OAuth token from mobile app
 */
router.post('/connect/azure', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const connectSchema = Joi.object({
      accessToken: Joi.string().required(),
      subscriptionId: Joi.string().guid().optional(),
      accountName: Joi.string().min(1).max(100).optional()
    });

    const { error, value } = connectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your Azure connection details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accessToken, subscriptionId, accountName } = value;

    // Get Azure subscriptions
    const subscriptionsResponse = await fetch('https://management.azure.com/subscriptions?api-version=2020-01-01', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!subscriptionsResponse.ok) {
      throw new Error('Failed to validate Azure access token');
    }

    const subscriptionsData = await subscriptionsResponse.json();
    let subscription;

    if (subscriptionId) {
      subscription = subscriptionsData.value.find(sub => sub.subscriptionId === subscriptionId);
      if (!subscription) {
        return res.status(400).json({
          success: false,
          error: 'Subscription Not Found',
          message: 'The specified subscription was not found',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      subscription = subscriptionsData.value[0];
      if (!subscription) {
        return res.status(400).json({
          success: false,
          error: 'No Subscriptions Found',
          message: 'No Azure subscriptions found for this account',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Check if account already exists
    const { CloudAccount } = require('../models');
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'azure',
        account_id: subscription.subscriptionId,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Connected',
        message: 'This Azure subscription is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'azure',
      account_name: accountName || subscription.displayName || `Azure Subscription ${subscription.subscriptionId}`,
      account_id: subscription.subscriptionId,
      is_active: true,
      metadata: {
        tenantId: subscription.tenantId,
        state: subscription.state,
        setupDate: new Date().toISOString(),
        connectionType: 'oauth'
      }
    });

    // Encrypt and store credentials
    cloudAccount.encryptCredentials({
      accessToken,
      subscriptionId: subscription.subscriptionId,
      tenantId: subscription.tenantId
    });
    await cloudAccount.save();

    // Test connection
    try {
      const CloudServiceFactory = require('../services/CloudServiceFactory');
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'azure', subscription.subscriptionId);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Test Failed',
          message: 'Failed to validate Azure connection',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Test Failed',
        message: 'Failed to test Azure connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Azure account connected via OAuth', {
      userId: req.userId,
      subscriptionId: subscription.subscriptionId,
      accountName: cloudAccount.account_name,
      requestId: req.id
    });

    res.status(201).json({
      success: true,
      message: 'Azure account connected successfully',
      data: {
        account: cloudAccount.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Azure OAuth connection error', {
      error: error.message,
      userId: req.userId,
      requestId: req.id
    });
    next(error);
  }
});

/**
 * POST /api/auth/connect/gcp
 * Connect GCP account using OAuth token from mobile app
 */
router.post('/connect/gcp', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const connectSchema = Joi.object({
      accessToken: Joi.string().required(),
      refreshToken: Joi.string().optional(),
      projectId: Joi.string().optional(),
      accountName: Joi.string().min(1).max(100).optional()
    });

    const { error, value } = connectSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your GCP connection details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accessToken, refreshToken, projectId, accountName } = value;

    // Get GCP projects
    const projectsResponse = await fetch('https://cloudresourcemanager.googleapis.com/v1/projects', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!projectsResponse.ok) {
      throw new Error('Failed to validate GCP access token');
    }

    const projectsData = await projectsResponse.json();
    let project;

    if (projectId) {
      project = projectsData.projects?.find(p => p.projectId === projectId);
      if (!project) {
        return res.status(400).json({
          success: false,
          error: 'Project Not Found',
          message: 'The specified GCP project was not found',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      project = projectsData.projects?.[0];
      if (!project) {
        return res.status(400).json({
          success: false,
          error: 'No Projects Found',
          message: 'No GCP projects found for this account',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Get billing account info
    let billingData = {};
    try {
      const billingResponse = await fetch(`https://cloudbilling.googleapis.com/v1/projects/${project.projectId}/billingInfo`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (billingResponse.ok) {
        billingData = await billingResponse.json();
      }
    } catch (billingError) {
      logger.warn('Failed to fetch billing info', { projectId: project.projectId, error: billingError.message });
    }

    // Check if account already exists
    const { CloudAccount } = require('../models');
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'gcp',
        account_id: project.projectId,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Connected',
        message: 'This GCP project is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'gcp',
      account_name: accountName || project.name || `GCP Project ${project.projectId}`,
      account_id: project.projectId,
      is_active: true,
      metadata: {
        projectNumber: project.projectNumber,
        billingAccountName: billingData.billingAccountName,
        billingEnabled: billingData.billingEnabled,
        setupDate: new Date().toISOString(),
        connectionType: 'oauth'
      }
    });

    // Encrypt and store credentials
    const credentials = {
      accessToken,
      projectId: project.projectId,
      billingAccountName: billingData.billingAccountName
    };
    
    if (refreshToken) {
      credentials.refreshToken = refreshToken;
    }

    cloudAccount.encryptCredentials(credentials);
    await cloudAccount.save();

    // Test connection
    try {
      const CloudServiceFactory = require('../services/CloudServiceFactory');
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'gcp', project.projectId);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Test Failed',
          message: 'Failed to validate GCP connection',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Test Failed',
        message: 'Failed to test GCP connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('GCP account connected via OAuth', {
      userId: req.userId,
      projectId: project.projectId,
      accountName: cloudAccount.account_name,
      requestId: req.id
    });

    res.status(201).json({
      success: true,
      message: 'GCP account connected successfully',
      data: {
        account: cloudAccount.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('GCP OAuth connection error', {
      error: error.message,
      userId: req.userId,
      requestId: req.id
    });
    next(error);
  }
});

/**
 * POST /api/auth/refresh-token
 * Refresh OAuth tokens for cloud providers
 */
router.post('/refresh-token', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const refreshSchema = Joi.object({
      accountId: Joi.string().uuid().required(),
      refreshToken: Joi.string().optional()
    });

    const { error, value } = refreshSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please provide valid account ID',
        timestamp: new Date().toISOString()
      });
    }

    const { accountId, refreshToken } = value;

    const { CloudAccount } = require('../models');
    const cloudAccount = await CloudAccount.findOne({
      where: {
        id: accountId,
        user_id: req.userId,
        is_active: true
      }
    });

    if (!cloudAccount) {
      return res.status(404).json({
        success: false,
        error: 'Account Not Found',
        message: 'Cloud account not found',
        timestamp: new Date().toISOString()
      });
    }

    const credentials = cloudAccount.decryptCredentials();
    const tokenToUse = refreshToken || credentials.refreshToken;

    if (!tokenToUse) {
      return res.status(400).json({
        success: false,
        error: 'No Refresh Token',
        message: 'This account does not have a refresh token',
        timestamp: new Date().toISOString()
      });
    }

    let tokenResponse;

    // Refresh token based on provider
    switch (cloudAccount.provider) {
      case 'azure':
        tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            refresh_token: tokenToUse,
            grant_type: 'refresh_token',
            scope: 'https://management.azure.com/.default'
          })
        });
        break;

      case 'gcp':
        tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            refresh_token: tokenToUse,
            grant_type: 'refresh_token'
          })
        });
        break;

      default:
        return res.status(400).json({
          success: false,
          error: 'Unsupported Provider',
          message: 'Token refresh not supported for this provider',
          timestamp: new Date().toISOString()
        });
    }

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || 'Failed to refresh token');
    }

    // Update stored credentials
    const updatedCredentials = {
      ...credentials,
      accessToken: tokenData.access_token
    };

    if (tokenData.refresh_token) {
      updatedCredentials.refreshToken = tokenData.refresh_token;
    }

    cloudAccount.encryptCredentials(updatedCredentials);
    await cloudAccount.save();

    logger.info('OAuth token refreshed', {
      userId: req.userId,
      provider: cloudAccount.provider,
      accountId: cloudAccount.account_id,
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'OAuth token refreshed successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Token refresh error', {
      error: error.message,
      requestId: req.id
    });
    next(error);
  }
});

/**
 * DELETE /api/auth/account
 * Delete user account and all associated data
 */
router.delete('/account', authenticateToken, async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User Not Found',
        message: 'User account not found',
        timestamp: new Date().toISOString()
      });
    }

    // Soft delete - deactivate account
    user.is_active = false;
    user.email = `deleted_${Date.now()}_${user.email}`;
    await user.save();

    logger.info('User account deleted', {
      userId: user.id,
      email: user.email,
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'Account deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;