const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const CloudServiceFactory = require('../services/CloudServiceFactory');
const { CloudAccount } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/azure/subscriptions
 * Get all Azure subscriptions for the authenticated user
 */
router.get('/subscriptions', authenticateToken, async (req, res, next) => {
  try {
    const azureAccounts = await CloudAccount.findAll({
      where: { 
        user_id: req.userId, 
        provider: 'azure', 
        is_active: true 
      },
      order: [['created_at', 'DESC']]
    });

    const subscriptionsWithStatus = azureAccounts.map(account => ({
      ...account.toJSON(),
      connectionStatus: account.sync_status,
      lastSyncTime: account.last_sync
    }));

    res.status(200).json({
      success: true,
      data: {
        subscriptions: subscriptionsWithStatus,
        count: subscriptionsWithStatus.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/subscriptions/:subscriptionId/health
 * Test specific Azure subscription connection and permissions
 */
router.get('/subscriptions/:subscriptionId/health', authenticateToken, async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;
    
    const result = await CloudServiceFactory.testConnection(req.userId, 'azure', subscriptionId);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        subscriptionId,
        connectionTest: result
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/azure/costs/current
 * Get current month Azure costs across all subscriptions or specific subscription
 */
router.get('/costs/current', authenticateToken, async (req, res, next) => {
  try {
    const { services, subscriptionId } = req.query;
    const options = {};
    
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    let costData;
    
    if (subscriptionId) {
      // Get costs for specific subscription
      const { service } = await CloudServiceFactory.getAzureService(req.userId, subscriptionId);
      costData = await service.getCurrentMonthCosts(options);
      costData.subscriptionId = subscriptionId;
    } else {
      // Get aggregated costs across all Azure subscriptions
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const azureServices = services.azure || [];
      
      if (azureServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No Azure Subscriptions',
          message: 'No active Azure subscriptions found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch costs from all Azure subscriptions in parallel
      const costPromises = azureServices.map(async ({ service, account }) => {
        try {
          const costs = await service.getCurrentMonthCosts(options);
          return {
            subscriptionId: account.account_id,
            accountName: account.account_name,
            ...costs
          };
        } catch (error) {
          logger.warn(`Failed to fetch costs for Azure subscription ${account.account_id}`, {
            error: error.message,
            userId: req.userId
          });
          return {
            subscriptionId: account.account_id,
            accountName: account.account_name,
            error: error.message,
            totalCost: 0,
            services: []
          };
        }
      });

      const subscriptionCosts = await Promise.all(costPromises);
      
      // Aggregate costs across subscriptions
      costData = {
        totalCost: subscriptionCosts.reduce((sum, subscription) => sum + (subscription.totalCost || 0), 0),
        currency: subscriptionCosts[0]?.currency || 'USD',
        period: subscriptionCosts[0]?.period,
        subscriptions: subscriptionCosts,
        subscriptionCount: azureServices.length
      };
    }
    
    logger.info(`Azure current month costs retrieved: $${costData.totalCost} ${costData.currency}`, {
      userId: req.userId,
      subscriptionId: subscriptionId || 'all',
      subscriptionCount: costData.subscriptionCount || 1
    });
    
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
 * Get Azure cost trends for specified time period across subscriptions
 */
router.get('/costs/trends', authenticateToken, async (req, res, next) => {
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

    const { subscriptionId } = req.query;
    let trendsData;
    
    if (subscriptionId) {
      // Get trends for specific subscription
      const { service } = await CloudServiceFactory.getAzureService(req.userId, subscriptionId);
      trendsData = await service.getCostTrends(startDate, endDate, granularity);
      trendsData.subscriptionId = subscriptionId;
    } else {
      // Get aggregated trends across all Azure subscriptions
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const azureServices = services.azure || [];
      
      if (azureServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No Azure Subscriptions',
          message: 'No active Azure subscriptions found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch trends from all subscriptions in parallel
      const trendPromises = azureServices.map(async ({ service, account }) => {
        try {
          const trends = await service.getCostTrends(startDate, endDate, granularity);
          return {
            subscriptionId: account.account_id,
            accountName: account.account_name,
            ...trends
          };
        } catch (error) {
          logger.warn(`Failed to fetch trends for Azure subscription ${account.account_id}`, {
            error: error.message
          });
          return null;
        }
      });

      const subscriptionTrends = (await Promise.all(trendPromises)).filter(Boolean);
      
      // Aggregate trends data
      trendsData = {
        period: { startDate, endDate },
        granularity,
        subscriptions: subscriptionTrends,
        subscriptionCount: azureServices.length
      };
    }
    
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
 * Get top cost-driving Azure services across subscriptions
 */
router.get('/services/top', authenticateToken, async (req, res, next) => {
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

    const { subscriptionId } = req.query;
    let topServices;
    
    if (subscriptionId) {
      // Get top services for specific subscription
      const { service } = await CloudServiceFactory.getAzureService(req.userId, subscriptionId);
      topServices = await service.getTopServices(limitNum);
    } else {
      // Get aggregated top services across all Azure subscriptions
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const azureServices = services.azure || [];
      
      if (azureServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No Azure Subscriptions',
          message: 'No active Azure subscriptions found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch top services from all subscriptions
      const servicePromises = azureServices.map(async ({ service, account }) => {
        try {
          const services = await service.getTopServices(limitNum);
          return services.map(svc => ({
            ...svc,
            subscriptionId: account.account_id,
            accountName: account.account_name
          }));
        } catch (error) {
          logger.warn(`Failed to fetch top services for Azure subscription ${account.account_id}`, {
            error: error.message
          });
          return [];
        }
      });

      const allServices = (await Promise.all(servicePromises)).flat();
      
      // Aggregate and sort by cost
      const serviceMap = new Map();
      allServices.forEach(service => {
        const key = service.serviceName;
        if (serviceMap.has(key)) {
          const existing = serviceMap.get(key);
          existing.cost += service.cost;
          existing.subscriptions = [...new Set([...existing.subscriptions, {
            subscriptionId: service.subscriptionId,
            accountName: service.accountName
          }])];
        } else {
          serviceMap.set(key, {
            serviceName: service.serviceName,
            cost: service.cost,
            currency: service.currency,
            subscriptions: [{
              subscriptionId: service.subscriptionId,
              accountName: service.accountName
            }]
          });
        }
      });
      
      topServices = Array.from(serviceMap.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limitNum);
    }
    
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
 * Get Azure budget information for specific subscription
 */
router.get('/budgets', authenticateToken, async (req, res, next) => {
  try {
    const { subscriptionId } = req.query;
    
    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Azure Subscription ID is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const { service } = await CloudServiceFactory.getAzureService(req.userId, subscriptionId);
    const budgets = await service.getBudgets();
    
    logger.info('Azure budgets retrieved', {
      userId: req.userId,
      subscriptionId
    });
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'azure',
        subscriptionId,
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
 * Get Azure cost forecast for next month across subscriptions or specific subscription
 */
router.get('/forecast', authenticateToken, async (req, res, next) => {
  try {
    const { subscriptionId } = req.query;
    let forecast;
    
    if (subscriptionId) {
      // Get forecast for specific subscription
      const { service } = await CloudServiceFactory.getAzureService(req.userId, subscriptionId);
      forecast = await service.getCostForecast();
      forecast.subscriptionId = subscriptionId;
    } else {
      // Get aggregated forecast across all Azure subscriptions
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const azureServices = services.azure || [];
      
      if (azureServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No Azure Subscriptions',
          message: 'No active Azure subscriptions found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch forecasts from all subscriptions in parallel
      const forecastPromises = azureServices.map(async ({ service, account }) => {
        try {
          const subscriptionForecast = await service.getCostForecast();
          return {
            subscriptionId: account.account_id,
            accountName: account.account_name,
            ...subscriptionForecast
          };
        } catch (error) {
          logger.warn(`Failed to fetch forecast for Azure subscription ${account.account_id}`, {
            error: error.message
          });
          return {
            subscriptionId: account.account_id,
            accountName: account.account_name,
            forecastedCost: 0,
            currency: 'USD'
          };
        }
      });

      const subscriptionForecasts = await Promise.all(forecastPromises);
      
      forecast = {
        forecastedCost: subscriptionForecasts.reduce((sum, subscription) => sum + (subscription.forecastedCost || 0), 0),
        currency: subscriptionForecasts[0]?.currency || 'USD',
        subscriptions: subscriptionForecasts,
        subscriptionCount: azureServices.length
      };
    }
    
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
 * Get comprehensive Azure cost summary for dashboard across all subscriptions
 */
router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const services = await CloudServiceFactory.getAllUserServices(req.userId);
    const azureServices = services.azure || [];
    
    if (azureServices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No Azure Subscriptions',
        message: 'No active Azure subscriptions found',
        timestamp: new Date().toISOString()
      });
    }

    // Fetch data from all Azure subscriptions in parallel
    const summaryPromises = azureServices.map(async ({ service, account }) => {
      try {
        const [currentCosts, topServices, forecast] = await Promise.all([
          service.getCurrentMonthCosts(),
          service.getTopServices(3),
          service.getCostForecast().catch(() => null)
        ]);
        
        return {
          subscriptionId: account.account_id,
          accountName: account.account_name,
          currentCosts,
          topServices,
          forecast
        };
      } catch (error) {
        logger.warn(`Failed to fetch summary for Azure subscription ${account.account_id}`, {
          error: error.message,
          userId: req.userId
        });
        return {
          subscriptionId: account.account_id,
          accountName: account.account_name,
          error: error.message,
          currentCosts: { totalCost: 0, currency: 'USD' },
          topServices: [],
          forecast: null
        };
      }
    });

    const subscriptionSummaries = await Promise.all(summaryPromises);
    
    // Aggregate data across subscriptions
    const totalCost = subscriptionSummaries.reduce((sum, subscription) => 
      sum + (subscription.currentCosts?.totalCost || 0), 0);
    
    const totalForecast = subscriptionSummaries.reduce((sum, subscription) => 
      sum + (subscription.forecast?.forecastedCost || 0), 0);
      
    // Aggregate top services across subscriptions
    const allServices = subscriptionSummaries.flatMap(subscription => 
      (subscription.topServices || []).map(service => ({ 
        ...service, 
        subscriptionId: subscription.subscriptionId,
        accountName: subscription.accountName 
      }))
    );
    
    const serviceMap = new Map();
    allServices.forEach(service => {
      const key = service.name || service.serviceName;
      if (serviceMap.has(key)) {
        const existing = serviceMap.get(key);
        existing.cost += service.cost;
      } else {
        serviceMap.set(key, { ...service, name: key });
      }
    });
    
    const aggregatedTopServices = Array.from(serviceMap.values())
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 3);

    const summary = {
      provider: 'azure',
      currentMonth: {
        totalCost: totalCost,
        currency: subscriptionSummaries[0]?.currentCosts?.currency || 'USD',
        period: subscriptionSummaries[0]?.currentCosts?.period
      },
      topServices: aggregatedTopServices,
      forecast: totalForecast > 0 ? {
        forecastedCost: totalForecast,
        currency: subscriptionSummaries[0]?.forecast?.currency || 'USD'
      } : null,
      subscriptions: subscriptionSummaries.map(subscription => ({
        subscriptionId: subscription.subscriptionId,
        accountName: subscription.accountName,
        totalCost: subscription.currentCosts?.totalCost || 0,
        forecastedCost: subscription.forecast?.forecastedCost || 0,
        hasError: !!subscription.error
      })),
      subscriptionCount: azureServices.length,
      lastUpdated: new Date().toISOString()
    };

    logger.info(`Azure multi-subscription summary retrieved: $${totalCost} USD`, {
      userId: req.userId,
      subscriptionCount: azureServices.length,
      totalCost
    });
    
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