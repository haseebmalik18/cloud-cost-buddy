const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const CloudServiceFactory = require('../services/CloudServiceFactory');
const { CloudAccount } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/gcp/projects
 * Get all GCP projects for the authenticated user
 */
router.get('/projects', authenticateToken, async (req, res, next) => {
  try {
    const gcpAccounts = await CloudAccount.findAll({
      where: { 
        user_id: req.userId, 
        provider: 'gcp', 
        is_active: true 
      },
      order: [['created_at', 'DESC']]
    });

    const projectsWithStatus = gcpAccounts.map(account => ({
      ...account.toJSON(),
      connectionStatus: account.sync_status,
      lastSyncTime: account.last_sync
    }));

    res.status(200).json({
      success: true,
      data: {
        projects: projectsWithStatus,
        count: projectsWithStatus.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/projects/:projectId/health
 * Test specific GCP project connection and permissions
 */
router.get('/projects/:projectId/health', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.params;
    
    const result = await CloudServiceFactory.testConnection(req.userId, 'gcp', projectId);
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        projectId,
        connectionTest: result
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/gcp/costs/current
 * Get current month GCP costs across all projects or specific project
 */
router.get('/costs/current', authenticateToken, async (req, res, next) => {
  try {
    const { services, projectId } = req.query;
    const options = {};
    
    if (services) {
      options.services = services.split(',').map(s => s.trim());
    }

    let costData;
    
    if (projectId) {
      // Get costs for specific project
      const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
      costData = await service.getCurrentMonthCosts(options);
      costData.projectId = projectId;
    } else {
      // Get aggregated costs across all GCP projects
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const gcpServices = services.gcp || [];
      
      if (gcpServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No GCP Projects',
          message: 'No active GCP projects found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch costs from all GCP projects in parallel
      const costPromises = gcpServices.map(async ({ service, account }) => {
        try {
          const costs = await service.getCurrentMonthCosts(options);
          return {
            projectId: account.account_id,
            accountName: account.account_name,
            ...costs
          };
        } catch (error) {
          logger.warn(`Failed to fetch costs for GCP project ${account.account_id}`, {
            error: error.message,
            userId: req.userId
          });
          return {
            projectId: account.account_id,
            accountName: account.account_name,
            error: error.message,
            totalCost: 0,
            services: []
          };
        }
      });

      const projectCosts = await Promise.all(costPromises);
      
      // Aggregate costs across projects
      costData = {
        totalCost: projectCosts.reduce((sum, project) => sum + (project.totalCost || 0), 0),
        currency: projectCosts[0]?.currency || 'USD',
        period: projectCosts[0]?.period,
        projects: projectCosts,
        projectCount: gcpServices.length
      };
    }
    
    logger.info(`GCP current month costs retrieved: $${costData.totalCost} ${costData.currency}`, {
      userId: req.userId,
      projectId: projectId || 'all',
      projectCount: costData.projectCount || 1
    });
    
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
 * Get GCP cost trends for specified time period across projects
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

    const { projectId } = req.query;
    let trendsData;
    
    if (projectId) {
      // Get trends for specific project
      const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
      trendsData = await service.getCostTrends(startDate, endDate, granularity);
      trendsData.projectId = projectId;
    } else {
      // Get aggregated trends across all GCP projects
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const gcpServices = services.gcp || [];
      
      if (gcpServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No GCP Projects',
          message: 'No active GCP projects found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch trends from all projects in parallel
      const trendPromises = gcpServices.map(async ({ service, account }) => {
        try {
          const trends = await service.getCostTrends(startDate, endDate, granularity);
          return {
            projectId: account.account_id,
            accountName: account.account_name,
            ...trends
          };
        } catch (error) {
          logger.warn(`Failed to fetch trends for GCP project ${account.account_id}`, {
            error: error.message
          });
          return null;
        }
      });

      const projectTrends = (await Promise.all(trendPromises)).filter(Boolean);
      
      // Aggregate trends data
      trendsData = {
        period: { startDate, endDate },
        granularity,
        projects: projectTrends,
        projectCount: gcpServices.length
      };
    }
    
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
 * Get top cost-driving GCP services across projects
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

    const { projectId } = req.query;
    let topServices;
    
    if (projectId) {
      // Get top services for specific project
      const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
      topServices = await service.getTopServices(limitNum);
    } else {
      // Get aggregated top services across all GCP projects
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const gcpServices = services.gcp || [];
      
      if (gcpServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No GCP Projects',
          message: 'No active GCP projects found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch top services from all projects
      const servicePromises = gcpServices.map(async ({ service, account }) => {
        try {
          const services = await service.getTopServices(limitNum);
          return services.map(svc => ({
            ...svc,
            projectId: account.account_id,
            accountName: account.account_name
          }));
        } catch (error) {
          logger.warn(`Failed to fetch top services for GCP project ${account.account_id}`, {
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
          existing.projects = [...new Set([...existing.projects, {
            projectId: service.projectId,
            accountName: service.accountName
          }])];
        } else {
          serviceMap.set(key, {
            serviceName: service.serviceName,
            cost: service.cost,
            currency: service.currency,
            projects: [{
              projectId: service.projectId,
              accountName: service.accountName
            }]
          });
        }
      });
      
      topServices = Array.from(serviceMap.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limitNum);
    }
    
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
 * Get GCP budget information for specific project
 */
router.get('/budgets', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'GCP Project ID is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
    const budgets = await service.getBudgets();
    
    logger.info('GCP budgets retrieved', {
      userId: req.userId,
      projectId
    });
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        projectId,
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
 * Get GCP cost forecast for next month across projects or specific project
 */
router.get('/forecast', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    let forecast;
    
    if (projectId) {
      // Get forecast for specific project
      const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
      forecast = await service.getCostForecast();
      forecast.projectId = projectId;
    } else {
      // Get aggregated forecast across all GCP projects
      const services = await CloudServiceFactory.getAllUserServices(req.userId);
      const gcpServices = services.gcp || [];
      
      if (gcpServices.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No GCP Projects',
          message: 'No active GCP projects found',
          timestamp: new Date().toISOString()
        });
      }

      // Fetch forecasts from all projects in parallel
      const forecastPromises = gcpServices.map(async ({ service, account }) => {
        try {
          const projectForecast = await service.getCostForecast();
          return {
            projectId: account.account_id,
            accountName: account.account_name,
            ...projectForecast
          };
        } catch (error) {
          logger.warn(`Failed to fetch forecast for GCP project ${account.account_id}`, {
            error: error.message
          });
          return {
            projectId: account.account_id,
            accountName: account.account_name,
            forecastedCost: 0,
            currency: 'USD'
          };
        }
      });

      const projectForecasts = await Promise.all(forecastPromises);
      
      forecast = {
        forecastedCost: projectForecasts.reduce((sum, project) => sum + (project.forecastedCost || 0), 0),
        currency: projectForecasts[0]?.currency || 'USD',
        projects: projectForecasts,
        projectCount: gcpServices.length
      };
    }
    
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
 * Get comprehensive GCP cost summary for dashboard across all projects
 */
router.get('/summary', authenticateToken, async (req, res, next) => {
  try {
    const services = await CloudServiceFactory.getAllUserServices(req.userId);
    const gcpServices = services.gcp || [];
    
    if (gcpServices.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No GCP Projects',
        message: 'No active GCP projects found',
        timestamp: new Date().toISOString()
      });
    }

    // Fetch data from all GCP projects in parallel
    const summaryPromises = gcpServices.map(async ({ service, account }) => {
      try {
        const [currentCosts, topServices, forecast] = await Promise.all([
          service.getCurrentMonthCosts(),
          service.getTopServices(3),
          service.getCostForecast().catch(() => null)
        ]);
        
        return {
          projectId: account.account_id,
          accountName: account.account_name,
          currentCosts,
          topServices,
          forecast
        };
      } catch (error) {
        logger.warn(`Failed to fetch summary for GCP project ${account.account_id}`, {
          error: error.message,
          userId: req.userId
        });
        return {
          projectId: account.account_id,
          accountName: account.account_name,
          error: error.message,
          currentCosts: { totalCost: 0, currency: 'USD' },
          topServices: [],
          forecast: null
        };
      }
    });

    const projectSummaries = await Promise.all(summaryPromises);
    
    // Aggregate data across projects
    const totalCost = projectSummaries.reduce((sum, project) => 
      sum + (project.currentCosts?.totalCost || 0), 0);
    
    const totalForecast = projectSummaries.reduce((sum, project) => 
      sum + (project.forecast?.forecastedCost || 0), 0);
      
    // Aggregate top services across projects
    const allServices = projectSummaries.flatMap(project => 
      (project.topServices || []).map(service => ({ 
        ...service, 
        projectId: project.projectId,
        accountName: project.accountName 
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
      provider: 'gcp',
      currentMonth: {
        totalCost: totalCost,
        currency: projectSummaries[0]?.currentCosts?.currency || 'USD',
        period: projectSummaries[0]?.currentCosts?.period
      },
      topServices: aggregatedTopServices,
      forecast: totalForecast > 0 ? {
        forecastedCost: totalForecast,
        currency: projectSummaries[0]?.forecast?.currency || 'USD'
      } : null,
      projects: projectSummaries.map(project => ({
        projectId: project.projectId,
        accountName: project.accountName,
        totalCost: project.currentCosts?.totalCost || 0,
        forecastedCost: project.forecast?.forecastedCost || 0,
        hasError: !!project.error
      })),
      projectCount: gcpServices.length,
      lastUpdated: new Date().toISOString()
    };

    logger.info(`GCP multi-project summary retrieved: $${totalCost} USD`, {
      userId: req.userId,
      projectCount: gcpServices.length,
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

/**
 * GET /api/gcp/billing-account
 * Get GCP billing account information for specific project
 */
router.get('/billing-account', authenticateToken, async (req, res, next) => {
  try {
    const { projectId } = req.query;
    
    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'GCP Project ID is required',
        timestamp: new Date().toISOString()
      });
    }
    
    const { service } = await CloudServiceFactory.getGCPService(req.userId, projectId);
    const billingInfo = await service.getBillingAccountInfo();
    
    logger.info('GCP billing account info retrieved', {
      userId: req.userId,
      projectId
    });
    
    res.status(200).json({
      success: true,
      data: {
        provider: 'gcp',
        projectId,
        ...billingInfo
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;