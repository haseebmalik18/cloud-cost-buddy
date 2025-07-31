const express = require('express');
const GCPService = require('../services/gcpService');
const logger = require('../utils/logger');

const router = express.Router();
const gcpService = new GCPService();

/**
 * GET /api/gcp/health
 * Test GCP connection and permissions
 */
router.get('/health', async (req, res, next) => {
  try {
    const result = await gcpService.testConnection();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'GCP Service Unavailable',
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/costs/current
 * Get current month GCP costs with service breakdown
 */
router.get('/costs/current', async (req, res, next) => {
  try {
    const { services } = req.query;
    const options = {};
    
    // Parse services filter if provided
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    const costData = await gcpService.getCurrentMonthCosts(options);
    
    logger.info(`GCP current month costs retrieved: $${costData.totalCost} ${costData.currency}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        ...costData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/costs/trends
 * Get GCP cost trends for specified time period
 */
router.get('/costs/trends', async (req, res, next) => {
  try {
    const { 
      startDate, 
      endDate, 
      granularity = 'Daily' 
    } = req.query;

    // Validate required parameters
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'startDate and endDate parameters are required',
        timestamp: new Date().toISOString()
      });
    }

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Dates must be in YYYY-MM-DD format',
        timestamp: new Date().toISOString()
      });
    }

    // Validate granularity
    const validGranularities = ['Daily', 'Monthly'];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Granularity must be Daily or Monthly',
        timestamp: new Date().toISOString()
      });
    }

    const trendsData = await gcpService.getCostTrends(startDate, endDate, granularity);
    
    logger.info(`GCP cost trends retrieved for ${startDate} to ${endDate}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        ...trendsData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/services/top
 * Get top cost-driving GCP services
 */
router.get('/services/top', async (req, res, next) => {
  try {
    const { limit = 5 } = req.query;
    const limitNum = parseInt(limit, 10);

    // Validate limit parameter
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 20) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Limit must be a number between 1 and 20',
        timestamp: new Date().toISOString()
      });
    }

    const topServices = await gcpService.getTopServices(limitNum);
    
    logger.info(`Top ${limitNum} GCP services retrieved`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        services: topServices,
        count: topServices.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/budgets
 * Get GCP budget information
 */
router.get('/budgets', async (req, res, next) => {
  try {
    const budgets = await gcpService.getBudgets();
    
    logger.info('GCP budgets retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        projectId: gcpService.projectId,
        billingAccountId: gcpService.billingAccountId,
        budgets,
        count: budgets.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/forecast
 * Get GCP cost forecast for next month
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const forecast = await gcpService.getCostForecast();
    
    logger.info('GCP cost forecast retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        forecast
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/summary
 * Get comprehensive GCP cost summary for dashboard
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Fetch multiple data points in parallel for dashboard
    const [currentCosts, topServices, forecast] = await Promise.all([
      gcpService.getCurrentMonthCosts(),
      gcpService.getTopServices(3), // Top 3 for dashboard
      gcpService.getCostForecast().catch(() => null) // Forecast is optional
    ]);

    const summary = {
      provider: 'gcp',
      currentMonth: {
        totalCost: currentCosts.totalCost,
        currency: currentCosts.currency,
        period: currentCosts.period
      },
      topServices: topServices.slice(0, 3), // Ensure only top 3
      forecast: forecast ? {
        forecastedCost: forecast.forecastedCost,
        currency: forecast.currency
      } : null,
      lastUpdated: new Date().toISOString()
    };

    logger.info(`GCP summary retrieved: $${currentCosts.totalCost} ${currentCosts.currency}`);
    
    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/billing-account
 * Get GCP billing account information
 */
router.get('/billing-account', async (req, res, next) => {
  try {
    const billingInfo = await gcpService.getBillingAccountInfo();
    
    logger.info('GCP billing account info retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        ...billingInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;