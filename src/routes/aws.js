const express = require('express');
const AWSService = require('../services/awsService');
const logger = require('../utils/logger');

const router = express.Router();
const awsService = new AWSService();

/**
 * GET /api/aws/health
 * Test AWS connection and permissions
 */
router.get('/health', async (req, res, next) => {
  try {
    const result = await awsService.testConnection();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'AWS Service Unavailable',
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/costs/current
 * Get current month AWS costs with service breakdown
 */
router.get('/costs/current', async (req, res, next) => {
  try {
    const { services } = req.query;
    const options = {};
    
    // Parse services filter if provided
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    const costData = await awsService.getCurrentMonthCosts(options);
    
    logger.info(`AWS current month costs retrieved: $${costData.totalCost} ${costData.currency}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
        ...costData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/costs/trends
 * Get AWS cost trends for specified time period
 */
router.get('/costs/trends', async (req, res, next) => {
  try {
    const { 
      startDate, 
      endDate, 
      granularity = 'DAILY' 
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
    const validGranularities = ['DAILY', 'MONTHLY', 'HOURLY'];
    if (!validGranularities.includes(granularity.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Granularity must be DAILY, MONTHLY, or HOURLY',
        timestamp: new Date().toISOString()
      });
    }

    const trendsData = await awsService.getCostTrends(startDate, endDate, granularity.toUpperCase());
    
    logger.info(`AWS cost trends retrieved for ${startDate} to ${endDate}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
        ...trendsData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/services/top
 * Get top cost-driving AWS services
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

    const topServices = await awsService.getTopServices(limitNum);
    
    logger.info(`Top ${limitNum} AWS services retrieved`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
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
 * GET /api/aws/budgets
 * Get AWS budget information
 */
router.get('/budgets', async (req, res, next) => {
  try {
    const { accountId } = req.query;

    if (!accountId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'AWS Account ID is required',
        timestamp: new Date().toISOString()
      });
    }

    // Validate account ID format (12 digits)
    if (!/^\d{12}$/.test(accountId)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'AWS Account ID must be a 12-digit number',
        timestamp: new Date().toISOString()
      });
    }

    const budgets = await awsService.getBudgets(accountId);
    
    logger.info(`AWS budgets retrieved for account ${accountId}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
        accountId,
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
 * GET /api/aws/forecast
 * Get AWS cost forecast for next month
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const forecast = await awsService.getCostForecast();
    
    logger.info('AWS cost forecast retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
        forecast
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/summary
 * Get comprehensive AWS cost summary for dashboard
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Fetch multiple data points in parallel for dashboard
    const [currentCosts, topServices, forecast] = await Promise.all([
      awsService.getCurrentMonthCosts(),
      awsService.getTopServices(3), // Top 3 for dashboard
      awsService.getCostForecast().catch(() => null) // Forecast is optional
    ]);

    const summary = {
      provider: 'aws',
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

    logger.info(`AWS summary retrieved: $${currentCosts.totalCost} ${currentCosts.currency}`);
    
    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;