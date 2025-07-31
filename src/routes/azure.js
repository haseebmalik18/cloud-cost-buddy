const express = require('express');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Placeholder routes for Azure Cost Management API
 * These will be implemented in Week 2
 */

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Azure integration coming in Week 2',
    timestamp: new Date().toISOString()
  });
});

router.get('/costs/current', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'Azure cost integration will be available in Week 2',
    timestamp: new Date().toISOString()
  });
});

router.get('/summary', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'Azure summary will be available in Week 2',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;