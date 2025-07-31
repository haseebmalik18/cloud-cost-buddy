const express = require('express');
const AzureService = require('../services/azureService');
const logger = require('../utils/logger');

const router = express.Router();
const azureService = new AzureService();

/**
 * GET /api/azure/health
 * Test Azure connection and permissions
 */
router.get('/health', async (req, res, next) => {
  try {
    const result = await azureService.testConnection();
    
    if (result.success) {
      res.status(200).json({
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        error: 'Azure Service Unavailable',
        message: result.message,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/costs/current
 * Get current month Azure costs with service breakdown
 */
router.get('/costs/current', async (req, res, next) => {
  try {
    const { services } = req.query;
    const options = {};
    
    // Parse services filter if provided
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    const costData = await azureService.getCurrentMonthCosts(options);
    
    logger.info(`Azure current month costs retrieved: $${costData.totalCost} ${costData.currency}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        ...costData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/costs/trends
 * Get Azure cost trends for specified time period
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

    const trendsData = await azureService.getCostTrends(startDate, endDate, granularity);
    
    logger.info(`Azure cost trends retrieved for ${startDate} to ${endDate}`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        ...trendsData
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/services/top
 * Get top cost-driving Azure services
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

    const topServices = await azureService.getTopServices(limitNum);
    
    logger.info(`Top ${limitNum} Azure services retrieved`);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
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
 * GET /api/azure/budgets
 * Get Azure budget information
 */
router.get('/budgets', async (req, res, next) => {
  try {
    const budgets = await azureService.getBudgets();
    
    logger.info('Azure budgets retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        subscriptionId: azureService.subscriptionId,
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
 * GET /api/azure/forecast
 * Get Azure cost forecast for next month
 */
router.get('/forecast', async (req, res, next) => {
  try {
    const forecast = await azureService.getCostForecast();
    
    logger.info('Azure cost forecast retrieved');
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        forecast
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/summary
 * Get comprehensive Azure cost summary for dashboard
 */
router.get('/summary', async (req, res, next) => {
  try {
    // Fetch multiple data points in parallel for dashboard
    const [currentCosts, topServices, forecast] = await Promise.all([
      azureService.getCurrentMonthCosts(),
      azureService.getTopServices(3), // Top 3 for dashboard
      azureService.getCostForecast().catch(() => null) // Forecast is optional
    ]);

    const summary = {
      provider: 'azure',
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

    logger.info(`Azure summary retrieved: $${currentCosts.totalCost} ${currentCosts.currency}`);
    
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