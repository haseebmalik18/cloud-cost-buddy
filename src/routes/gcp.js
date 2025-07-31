const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Placeholder routes for GCP Cloud Billing API
 * These will be implemented in Week 3
 */

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'GCP integration coming in Week 3',
    timestamp: new Date().toISOString()
  });
});

router.get('/costs/current', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'GCP cost integration will be available in Week 3',
    timestamp: new Date().toISOString()
  });
});

router.get('/summary', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'GCP summary will be available in Week 3',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;