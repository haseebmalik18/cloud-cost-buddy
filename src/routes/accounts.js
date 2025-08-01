const express = require('express');
const Joi = require('joi');
const { CloudAccount } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const { sanitizeInput } = require('../middleware/validators');
const CloudServiceFactory = require('../services/CloudServiceFactory');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const awsAccountSchema = Joi.object({
  accountName: Joi.string().min(1).max(100).required(),
  accountId: Joi.string().pattern(/^\d{12}$/).required(),
  roleArn: Joi.string().pattern(/^arn:aws:iam::\d{12}:role\//).required(),
  externalId: Joi.string().min(8).max(64).optional(),
  region: Joi.string().default('us-east-1'),
});

const azureAccountSchema = Joi.object({
  accountName: Joi.string().min(1).max(100).required(),
  subscriptionId: Joi.string().guid().required(),
  clientId: Joi.string().guid().required(),
  clientSecret: Joi.string().min(1).required(),
  tenantId: Joi.string().guid().required(),
});

const gcpAccountSchema = Joi.object({
  accountName: Joi.string().min(1).max(100).required(),
  projectId: Joi.string().min(1).max(63).required(),
  billingAccountId: Joi.string().min(1).required(),
  serviceAccountKey: Joi.object().required(),
  billingDatasetId: Joi.string().default('billing_export'),
  billingTablePrefix: Joi.string().default('gcp_billing_export_v1'),
});

/**
 * GET /api/accounts
 * Get all cloud accounts for the authenticated user
 */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const cloudAccounts = await CloudAccount.findAll({
      where: { user_id: req.userId, is_active: true },
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: {
        accounts: cloudAccounts.map(account => account.toJSON())
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/accounts/aws
 * Add AWS account for the authenticated user
 */
router.post('/aws', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = awsAccountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your AWS account details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accountName, accountId, roleArn, externalId, region } = value;

    // Check if account already exists for this user
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'aws',
        account_id: accountId,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Exists',
        message: 'This AWS account is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'aws',
      account_name: accountName,
      account_id: accountId,
      is_active: true,
      metadata: {
        region,
        setupDate: new Date().toISOString()
      }
    });

    // Encrypt and store credentials
    cloudAccount.encryptCredentials({
      roleArn,
      externalId,
      region,
      accountId
    });
    await cloudAccount.save();

    // Test connection
    try {
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'aws', accountId);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Failed',
          message: 'Failed to connect to AWS account',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Failed',
        message: 'Failed to test AWS connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('AWS account added successfully', {
      userId: req.userId,
      accountId,
      accountName,
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
    next(error);
  }
});

/**
 * POST /api/accounts/azure
 * Add Azure account for the authenticated user
 */
router.post('/azure', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = azureAccountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your Azure account details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accountName, subscriptionId, clientId, clientSecret, tenantId } = value;

    // Check if account already exists for this user
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'azure',
        account_id: subscriptionId,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Exists',
        message: 'This Azure subscription is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'azure',
      account_name: accountName,
      account_id: subscriptionId,
      is_active: true,
      metadata: {
        tenantId,
        setupDate: new Date().toISOString()
      }
    });

    // Encrypt and store credentials
    cloudAccount.encryptCredentials({
      subscriptionId,
      clientId,
      clientSecret,
      tenantId
    });
    await cloudAccount.save();

    // Test connection
    try {
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'azure', subscriptionId);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Failed',
          message: 'Failed to connect to Azure subscription',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Failed',
        message: 'Failed to test Azure connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('Azure account added successfully', {
      userId: req.userId,
      subscriptionId,
      accountName,
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
    next(error);
  }
});

/**
 * POST /api/accounts/gcp
 * Add GCP account for the authenticated user
 */
router.post('/gcp', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    // Validate request body
    const { error, value } = gcpAccountSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please check your GCP account details',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        })),
        timestamp: new Date().toISOString()
      });
    }

    const { accountName, projectId, billingAccountId, serviceAccountKey, billingDatasetId, billingTablePrefix } = value;

    // Check if account already exists for this user
    const existingAccount = await CloudAccount.findOne({
      where: {
        user_id: req.userId,
        provider: 'gcp',
        account_id: projectId,
        is_active: true
      }
    });

    if (existingAccount) {
      return res.status(409).json({
        success: false,
        error: 'Account Already Exists',
        message: 'This GCP project is already connected',
        timestamp: new Date().toISOString()
      });
    }

    // Create cloud account record
    const cloudAccount = await CloudAccount.create({
      user_id: req.userId,
      provider: 'gcp',
      account_name: accountName,
      account_id: projectId,
      is_active: true,
      metadata: {
        billingAccountId,
        billingDatasetId,
        setupDate: new Date().toISOString()
      }
    });

    // Encrypt and store credentials
    cloudAccount.encryptCredentials({
      projectId,
      billingAccountId,
      serviceAccountKey: JSON.stringify(serviceAccountKey),
      billingDatasetId,
      billingTablePrefix
    });
    await cloudAccount.save();

    // Test connection
    try {
      const testResult = await CloudServiceFactory.testConnection(req.userId, 'gcp', projectId);
      
      if (!testResult.success) {
        await cloudAccount.updateSyncStatus('error', testResult.message);
        return res.status(400).json({
          success: false,
          error: 'Connection Failed',
          message: 'Failed to connect to GCP project',
          details: { connectionError: testResult.message },
          timestamp: new Date().toISOString()
        });
      }
    } catch (testError) {
      await cloudAccount.updateSyncStatus('error', testError.message);
      return res.status(400).json({
        success: false,
        error: 'Connection Failed',
        message: 'Failed to test GCP connection',
        details: { connectionError: testError.message },
        timestamp: new Date().toISOString()
      });
    }

    logger.info('GCP account added successfully', {
      userId: req.userId,
      projectId,
      accountName,
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
    next(error);
  }
});

/**
 * PUT /api/accounts/:accountId/test
 * Test connection for a specific cloud account
 */
router.put('/:accountId/test', authenticateToken, async (req, res, next) => {
  try {
    const { accountId } = req.params;

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

    // Test connection
    const testResult = await CloudServiceFactory.testConnection(
      req.userId,
      cloudAccount.provider,
      cloudAccount.account_id
    );

    res.status(200).json({
      success: true,
      data: {
        connectionTest: testResult,
        account: cloudAccount.toJSON()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/accounts/:accountId
 * Remove a cloud account
 */
router.delete('/:accountId', authenticateToken, async (req, res, next) => {
  try {
    const { accountId } = req.params;

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

    // Soft delete - deactivate account
    cloudAccount.is_active = false;
    await cloudAccount.save();

    logger.info('Cloud account removed', {
      userId: req.userId,
      provider: cloudAccount.provider,
      accountId: cloudAccount.account_id,
      requestId: req.id
    });

    res.status(200).json({
      success: true,
      message: 'Account disconnected successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;