const express = require('express');
const { body, validationResult, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const alertService = require('../services/alertService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * Alert management routes
 */

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Alert system operational',
    timestamp: new Date().toISOString()
  });
});

// Get user alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await alertService.getUserAlerts(req.user.id);
    
    res.json({
      success: true,
      data: alerts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Create new alert
router.post('/', [
  body('type')
    .isIn(['budget_threshold', 'spike_detection', 'daily_summary', 'weekly_summary'])
    .withMessage('Invalid alert type'),
  body('provider')
    .optional()
    .isIn(['aws', 'azure', 'gcp', 'all'])
    .withMessage('Invalid provider'),
  body('thresholdValue')
    .optional()
    .isNumeric()
    .withMessage('Threshold value must be numeric'),
  body('thresholdPercentage')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Threshold percentage must be between 1 and 1000'),
  body('notificationChannels')
    .optional()
    .isArray()
    .withMessage('Notification channels must be an array'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const {
      type,
      provider = 'all',
      thresholdValue,
      thresholdCurrency = 'USD',
      thresholdPercentage,
      notificationChannels = ['push'],
      cloudAccountId
    } = req.body;

    const alert = await alertService.createAlert({
      userId: req.user.id,
      cloudAccountId,
      type,
      provider,
      thresholdValue,
      thresholdCurrency,
      thresholdPercentage,
      notificationChannels
    });

    res.status(201).json({
      success: true,
      data: alert,
      message: 'Alert created successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Update alert
router.put('/:alertId', [
  body('enabled').optional().isBoolean().withMessage('Enabled must be boolean'),
  body('thresholdValue').optional().isNumeric().withMessage('Threshold value must be numeric'),
  body('thresholdPercentage').optional().isInt({ min: 1, max: 1000 }).withMessage('Invalid threshold percentage'),
  body('notificationChannels').optional().isArray().withMessage('Notification channels must be an array'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { alertId } = req.params;
    const updates = req.body;

    const alert = await alertService.updateAlert(alertId, req.user.id, updates);

    res.json({
      success: true,
      data: alert,
      message: 'Alert updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error updating alert:', error);
    
    if (error.message === 'Alert not found') {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Delete alert
router.delete('/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    
    await alertService.deleteAlert(alertId, req.user.id);

    res.json({
      success: true,
      message: 'Alert deleted successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error deleting alert:', error);
    
    if (error.message === 'Alert not found') {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get alert history
router.get('/history', [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { limit = 50, offset = 0 } = req.query;
    
    const history = await alertService.getAlertHistory(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error fetching alert history:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Register FCM token for push notifications
router.post('/fcm-token', [
  body('token').notEmpty().withMessage('FCM token is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { token } = req.body;
    
    await notificationService.registerDeviceToken(req.user.id, token);

    res.json({
      success: true,
      message: 'FCM token registered successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error registering FCM token:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Remove FCM token
router.delete('/fcm-token', [
  body('token').notEmpty().withMessage('FCM token is required'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        details: errors.array(),
        timestamp: new Date().toISOString()
      });
    }

    const { token } = req.body;
    
    await notificationService.removeDeviceToken(req.user.id, token);

    res.json({
      success: true,
      message: 'FCM token removed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error removing FCM token:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test notification
router.post('/test-notification', async (req, res) => {
  try {
    await notificationService.testNotification(req.user.id);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error sending test notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Trigger manual alert check (for testing)
router.post('/check', async (req, res) => {
  try {
    await alertService.runAlertChecks();

    res.json({
      success: true,
      message: 'Alert checks completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error running alert checks:', error);
    res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;