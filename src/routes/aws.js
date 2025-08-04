const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const CloudServiceFactory = require('../services/CloudServiceFactory');
const { CloudAccount } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/aws/accounts
 * Get all AWS accounts for the authenticated user
 */
router.get('/accounts', authenticateToken, async (req, res, next) => {
  try {
    const awsAccounts = await CloudAccount.findAll({
      where: { 
        user_id: req.userId, 
        provider: 'aws', 
        is_active: true 
      },
      order: [['created_at', 'DESC']]
    });

    const accountsWithStatus = awsAccounts.map(account => ({
      ...account.toJSON(),
      connectionStatus: account.sync_status,
      lastSyncTime: account.last_sync
    }));

    res.status(200).json({
      success: true,
      data: {
        accounts: accountsWithStatus,
        count: accountsWithStatus.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/accounts/:accountId/health
 * Test specific AWS account connection and permissions
 */
router.get('/accounts/:accountId/health', authenticateToken, async (req, res, next) => {
  try {
    const { accountId } = req.params;
    
    const result = await CloudServiceFactory.testConnection(req.userId, 'aws', accountId);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'aws',
        accountId,
        connectionTest: result
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/aws/costs/current
 * Get current month AWS costs across all accounts or specific account
 */
router.get('/costs/current', authenticateToken, async (req, res, next) => {
  try {
    const { services, accountId } = req.query;
    const options = {};
    
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    let costData;
    
    if (accountId) {
      // Get costs for specific account
      const { service } = await CloudServiceFactory.getAWSService(req.userId, accountId);
      costData = await service.getCurrentMonthCosts(options);
      costData.accountId = accountId;
    } else {
      // Get aggregated costs across all AWS accounts
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const awsServices = services.aws || [];
      
      if (awsServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No AWS Accounts',
          message: 'No active AWS accounts found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch costs from all AWS accounts in parallel
      const costPromises = awsServices.map(async ({ service, account }) => {
        try {
          const costs = await service.getCurrentMonthCosts(options);
          return {
            accountId: account.account_id,
            accountName: account.account_name,
            ...costs
          };
        } catch (error) {
          logger.warn(`Failed to fetch costs for AWS account ${account.account_id}`, {
            error: error.message,
            userId: req.userId
          });
          return {
            accountId: account.account_id,
            accountName: account.account_name,
            error: error.message,
            totalCost: 0,
            services: []
          };
        }
      });

      const accountCosts = await Promise.all(costPromises);
      
      // Aggregate costs across accounts
      costData = {
        totalCost: accountCosts.reduce((sum, account) => sum + (account.totalCost || 0), 0),
        currency: accountCosts[0]?.currency || 'USD',
        period: accountCosts[0]?.period,
        accounts: accountCosts,
        accountCount: awsServices.length
      };
    }
    
    logger.info(`AWS current month costs retrieved: $${costData.totalCost} ${costData.currency}`, {
      userId: req.userId,
      accountId: accountId || 'all',
      accountCount: costData.accountCount || 1
    });
    
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
 * Get AWS cost trends for specified time period across accounts
 */
router.get('/costs/trends', authenticateToken, async (req, res, next) => {
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

    const { accountId } = req.query;
    let trendsData;
    
    if (accountId) {
      // Get trends for specific account
      const { service } = await CloudServiceFactory.getAWSService(req.userId, accountId);
      trendsData = await service.getCostTrends(startDate, endDate, granularity.toUpperCase());
      trendsData.accountId = accountId;
    } else {
      // Get aggregated trends across all AWS accounts
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const awsServices = services.aws || [];
      
      if (awsServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No AWS Accounts',
          message: 'No active AWS accounts found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch trends from all accounts in parallel
      const trendPromises = awsServices.map(async ({ service, account }) => {
        try {
          const trends = await service.getCostTrends(startDate, endDate, granularity.toUpperCase());
          return {
            accountId: account.account_id,
            accountName: account.account_name,
            ...trends
          };
        } catch (error) {
          logger.warn(`Failed to fetch trends for AWS account ${account.account_id}`, {
            error: error.message
          });
          return null;
        }
      });

      const accountTrends = (await Promise.all(trendPromises)).filter(Boolean);
      
      // Aggregate trends data
      trendsData = {
        period: { startDate, endDate },
        granularity: granularity.toUpperCase(),
        accounts: accountTrends,
        accountCount: awsServices.length
      };
    }
    
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
 * Get top cost-driving AWS services across accounts
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

    const { accountId } = req.query;
    let topServices;
    
    if (accountId) {
      // Get top services for specific account
      const { service } = await CloudServiceFactory.getAWSService(req.userId, accountId);
      topServices = await service.getTopServices(limitNum);
    } else {
      // Get aggregated top services across all AWS accounts
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const awsServices = services.aws || [];
      
      if (awsServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No AWS Accounts',
          message: 'No active AWS accounts found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch top services from all accounts
      const servicePromises = awsServices.map(async ({ service, account }) => {
        try {
          const services = await service.getTopServices(limitNum);
          return services.map(svc => ({ ...svc, accountId: account.account_id, accountName: account.account_name }));
        } catch (error) {
          logger.warn(`Failed to fetch top services for AWS account ${account.account_id}`, {
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
          existing.accounts = [...new Set([...existing.accounts, { accountId: service.accountId, accountName: service.accountName }])];
        } else {
          serviceMap.set(key, {
            serviceName: service.serviceName,
            cost: service.cost,
            currency: service.currency,
            accounts: [{ accountId: service.accountId, accountName: service.accountName }]
          });
        }
      });
      
      topServices = Array.from(serviceMap.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limitNum);
    }
    
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
 * Get AWS budget information for specific account
 */
router.get('/budgets', authenticateToken, async (req, res, next) => {
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

    const { service } = await CloudServiceFactory.getAWSService(req.userId, accountId);
    const budgets = await service.getBudgets(accountId);
    
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
 * Get AWS cost forecast for next month across accounts or specific account
 */
router.get('/forecast', authenticateToken, async (req, res, next) => {
  try {
    const { accountId } = req.query;
    let forecast;
    
    if (accountId) {
      // Get forecast for specific account
      const { service } = await CloudServiceFactory.getAWSService(req.userId, accountId);
      forecast = await service.getCostForecast();
      forecast.accountId = accountId;
    } else {
      // Get aggregated forecast across all AWS accounts
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const awsServices = services.aws || [];
      
      if (awsServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No AWS Accounts',
          message: 'No active AWS accounts found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch forecasts from all accounts in parallel
      const forecastPromises = awsServices.map(async ({ service, account }) => {
        try {
          const accountForecast = await service.getCostForecast();
          return {
            accountId: account.account_id,
            accountName: account.account_name,
            ...accountForecast
          };
        } catch (error) {
          logger.warn(`Failed to fetch forecast for AWS account ${account.account_id}`, {
            error: error.message
          });
          return {
            accountId: account.account_id,
            accountName: account.account_name,
            forecastedCost: 0,
            currency: 'USD'
          };
        }
      });

      const accountForecasts = await Promise.all(forecastPromises);
      
      forecast = {
        forecastedCost: accountForecasts.reduce((sum, account) => sum + (account.forecastedCost || 0), 0),
        currency: accountForecasts[0]?.currency || 'USD',
        accounts: accountForecasts,
        accountCount: awsServices.length
      };
    }
    
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
 * Get comprehensive AWS cost summary for dashboard across all accounts
 */
router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const services = await CloudServiceFactory.getAllUserServices(req.userId);
    const awsServices = services.aws || [];
    
    if (awsServices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No AWS Accounts',
        message: 'No active AWS accounts found',
        timestamp: new Date().toISOString()
      });
    }

    // Fetch data from all AWS accounts in parallel
    const summaryPromises = awsServices.map(async ({ service, account }) => {
      try {
        const [currentCosts, topServices, forecast] = await Promise.all([
          service.getCurrentMonthCosts(),
          service.getTopServices(3),
          service.getCostForecast().catch(() => null)
        ]);
        
        return {
          accountId: account.account_id,
          accountName: account.account_name,
          currentCosts,
          topServices,
          forecast
        };
      } catch (error) {
        logger.warn(`Failed to fetch summary for AWS account ${account.account_id}`, {
          error: error.message,
          userId: req.userId
        });
        return {
          accountId: account.account_id,
          accountName: account.account_name,
          error: error.message,
          currentCosts: { totalCost: 0, currency: 'USD' },
          topServices: [],
          forecast: null
        };
      }
    });

    const accountSummaries = await Promise.all(summaryPromises);
    
    // Aggregate data across accounts
    const totalCost = accountSummaries.reduce((sum, account) => 
      sum + (account.currentCosts?.totalCost || 0), 0);
    
    const totalForecast = accountSummaries.reduce((sum, account) => 
      sum + (account.forecast?.forecastedCost || 0), 0);
      
    // Aggregate top services across accounts
    const allServices = accountSummaries.flatMap(account => 
      (account.topServices || []).map(service => ({ 
        ...service, 
        accountId: account.accountId,
        accountName: account.accountName 
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
      provider: 'aws',
      currentMonth: {
        totalCost: totalCost,
        currency: accountSummaries[0]?.currentCosts?.currency || 'USD',
        period: accountSummaries[0]?.currentCosts?.period
      },
      topServices: aggregatedTopServices,
      forecast: totalForecast > 0 ? {
        forecastedCost: totalForecast,
        currency: accountSummaries[0]?.forecast?.currency || 'USD'
      } : null,
      accounts: accountSummaries.map(account => ({
        accountId: account.accountId,
        accountName: account.accountName,
        totalCost: account.currentCosts?.totalCost || 0,
        forecastedCost: account.forecast?.forecastedCost || 0,
        hasError: !!account.error
      })),
      accountCount: awsServices.length,
      lastUpdated: new Date().toISOString()
    };

    logger.info(`AWS multi-account summary retrieved: $${totalCost} USD`, {
      userId: req.userId,
      accountCount: awsServices.length,
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